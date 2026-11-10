# Tests

Smoke tests for the pure business logic in `src/lib/`. These don't touch the
database or network — they verify the booking-combination rules, the
haircut pricing formula, and the scheduling helpers.

## Running

```bash
bun test tests/
```

## What's covered

- `booking-rules.test.ts` — the allowed/forbidden combinations table from the
  project brief (1–5 haircuts; 1–2 majors; 1+1 combo rules).
- `pricing.test.ts` — haircut pricing (₱999 first + ₱500 each additional) and
  reservation fee (₱500 haircut / ₱1,500 major).
- `scheduling.test.ts` — `roundUpToHour`, `computeReservedMinutes` (with the
  brief's example table), `formatTime`, and `rawDepartureOptions`.
- `security-hardening.test.ts` — booking access tokens, mock-payment
  authorization rules, and PayRex webhook validation.
- `payment-concurrency.test.ts` — runs payment/cancellation lock-order races
  against a migrated PostgreSQL database when `SUPABASE_TEST_DATABASE_URL` and
  `psql` are available; otherwise this test is skipped.

## What's NOT covered (deliberate)

- End-to-end PayRex payment flow — requires real sandbox credentials.
- Full Supabase integration — requires a configured project; the race test
  uses the database functions but does not exercise every API/RLS path.
- PayRex sandbox behavior — no actual payment or provider request is made by
  these tests.

Add `bun:test` to your devDependencies if it isn't already:
```bash
bun add -d bun-types
```
