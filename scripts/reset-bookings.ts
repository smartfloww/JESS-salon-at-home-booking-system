/**
 * Wipe all bookings, payments, items and customers; keep the catalogue,
 * service areas and admin allowlist.
 */
import { getSupabaseAdminClient } from "./supabase-admin";

async function main() {
  const supabase = getSupabaseAdminClient();
  const deleteAll = async (table: "payments" | "booking_items" | "bookings" | "customers") => {
    const { data, error } = await supabase
      .from(table)
      .delete()
      .not("id", "is", null)
      .select("id");
    if (error) throw new Error(`Could not clear ${table}: ${error.message}`);
    return data.length;
  };

  const payments = await deleteAll("payments");
  const items = await deleteAll("booking_items");
  const bookings = await deleteAll("bookings");
  const customers = await deleteAll("customers");
  console.log(
    `Deleted ${bookings} bookings, ${items} items, ${payments} payments, ${customers} customers.`,
  );
}

main().catch((error) => {
  console.error("Booking reset failed:", error);
  process.exitCode = 1;
});
