import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "bun:test";

const databaseUrl = process.env.SUPABASE_TEST_DATABASE_URL;

function runPsql(sql: string, applicationName?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        "--no-psqlrc",
        "--set",
        "ON_ERROR_STOP=1",
        "--tuples-only",
        "--no-align",
        "--dbname",
        databaseUrl!,
        "--command",
        sql,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: applicationName
          ? { ...process.env, PGAPPNAME: applicationName }
          : process.env,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => (stdout += chunk));
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`psql exited ${code}: ${stderr}`));
    });
  });
}

if (databaseUrl) {
  test("serializes concurrent successful payment and admin cancellation", async () => {
    const runScenario = async (paymentLocksFirst: boolean) => {
      const areaId = randomUUID();
      const customerId = randomUUID();
      const bookingId = randomUUID();
      const paymentId = randomUUID();
      const reference = `CONCURRENCY-${randomUUID()}`;
      const providerRef = `checkout-${randomUUID()}`;

      await runPsql(`
        insert into public.service_areas (id, name, travel_minutes)
        values ('${areaId}', 'test-${areaId}', 0);
        insert into public.customers
          (id, full_name, phone, address, barangay, city, province)
        values ('${customerId}', 'Concurrency Test', '0000000000',
          'Test address', 'Test barangay', 'Test city', 'Test province');
        insert into public.bookings
          (id, reference, customer_id, area_id, appointment_date, departure_time,
           reserved_minutes, service_minutes, total_service_price, reservation_fee,
           remaining_balance, payment_deadline)
        values ('${bookingId}', '${reference}', '${customerId}', '${areaId}',
          current_date + 10000, 600, 60, 60, 100000, 50000, 50000, now() + interval '10 minutes');
        insert into public.payments (id, booking_id, provider_ref, amount)
        values ('${paymentId}', '${bookingId}', '${providerRef}', 50000);
      `);

      const paymentStatement = `select public.record_payment_success(
        '${reference}', '${providerRef}', 50000, '{"test":"concurrency"}'
      );`;
      const cancelStatement = `select public.admin_cancel_booking('${bookingId}');`;
      const holderName = `race-holder-${randomUUID()}`;
      const lockHolder = paymentLocksFirst
        ? `select id from public.bookings where id = '${bookingId}' for update;
           select pg_sleep(0.8);
           ${paymentStatement}`
        : `select id from public.bookings where id = '${bookingId}' for update;
           select pg_sleep(0.8);
           ${cancelStatement}`;
      const waitingOperation = paymentLocksFirst ? cancelStatement : paymentStatement;

      try {
        const firstSession = runPsql(`begin; ${lockHolder} commit;`, holderName);
        let lockHeld = false;
        for (let attempt = 0; attempt < 100 && !lockHeld; attempt += 1) {
          const activity = await runPsql(`
            select count(*) from pg_stat_activity
            where application_name = '${holderName}'
              and state = 'active'
              and query like '%pg_sleep(0.8)%';
          `);
          lockHeld = activity === "1";
          if (!lockHeld) await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(lockHeld).toBe(true);
        const secondSession = runPsql(waitingOperation);
        await Promise.all([firstSession, secondSession]);

        const state = await runPsql(`
          select b.status || ',' || p.status || ',' || p.reconciliation_status
          from public.bookings b
          join public.payments p on p.booking_id = b.id
          where b.id = '${bookingId}';
        `);
        const [bookingStatus, paymentStatus, reconciliationStatus] = state.split(",");

        expect(paymentStatus).toBe("successful");
        if (paymentLocksFirst) {
          expect(bookingStatus).toBe("cancelled");
          expect(reconciliationStatus).toBe("refund_required");
        } else {
          expect(bookingStatus).toBe("paid");
          expect(reconciliationStatus).toBe("none");
        }
      } finally {
        await runPsql(`delete from public.bookings where id = '${bookingId}';`);
        await runPsql(`delete from public.customers where id = '${customerId}';`);
        await runPsql(`delete from public.service_areas where id = '${areaId}';`);
      }
    };

    await runScenario(true);
    await runScenario(false);
  });
} else {
  test.skip("serializes concurrent successful payment and admin cancellation", () => {});
}
