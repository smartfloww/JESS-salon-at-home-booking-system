# JESS Salon at Home — Website & Booking System

A polished, mobile-friendly salon booking platform for JESS Salon at Home
(Batasan Hills, Quezon City, Philippines). Built on top of the existing
static React+Vite website, this version adds a full booking system, a
private admin dashboard for JESS, and a sandbox-ready PayRex payment
integration.

The backend uses **Supabase PostgreSQL**, **Supabase Auth**, and server-side
Supabase clients for booking and admin operations. PayRex remains a separate
server-side hosted-checkout integration.

---

## 1. Project overview

| Page | Route | Description |
|---|---|---|
| Home | `/` | Original JESS homepage with hero, services preview, at-home pitch, work preview, booking CTA. |
| Services | `/services` | Full service catalogue with the original accordion UI; prices fetched from the API. |
| About | `/about` | Reorganised Contact page: contact options, opening hours, how-booking-works panel. |
| Book | `/book` | 4-step booking flow: Service area → Services → Customer & appointment → Review & payment. |
| Book result | `/book/result` | Booking confirmation / pending / cancelled screen. |
| Mock checkout | `/book/mock-checkout` | Simulated PayRex checkout shown in MOCK payment mode. |
| Admin login | `/admin/login` | Supabase Auth sign-in for allowlisted JESS admin accounts. |
| Admin dashboard | `/admin` | Tabs: Pending · **Paid (default)** · Completed. Cancel / Mark Completed actions. |

### Tech stack

- **Next.js 16 (App Router)** + **TypeScript 5**
- **Tailwind CSS 4** + shadcn/ui component library
- **Supabase PostgreSQL** with versioned SQL migrations and Row Level Security
- **Supabase Auth** for admin sessions; server routes check the admin allowlist
- **PayRex** hosted Checkout Sessions + webhooks (sandbox-ready)
- Original JESS design system (Playfair Display + DM Sans, black/cream/gold)

---

## 2. Installation

```bash
# 1. Install dependencies
bun install

# 2. Create a Supabase project and configure environment (see .env.example)
cp .env.example .env
#   then set the Supabase project URL, anon key, and service-role key.
#   Keep SUPABASE_SERVICE_ROLE_KEY server-only.

# 3. Apply the PostgreSQL schema (install the Supabase CLI separately)
supabase link --project-ref YOUR_PROJECT_REF
supabase db push

# 4. Seed the service catalogue and service areas
bun run db:seed

# 5. Start the dev server
bun run dev
# → http://localhost:3000
```

Create JESS's user in **Supabase Dashboard → Authentication → Users**, then
add that Auth user's UUID to `public.admin_users` using the SQL Editor:

```sql
insert into public.admin_users (user_id)
values ('AUTH_USER_UUID');
```

Only users explicitly added to this allowlist can use the admin dashboard or
admin API routes. Disable public signups in the hosted project's Auth
settings. The seed script does not create Auth users or credentials.

---

## 3. Environment configuration

All configuration is via environment variables. See `.env.example` for the
full list with placeholder values.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public Supabase key used for Supabase Auth in the browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Server-only key used by backend routes and seed scripts. Never prefix it with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_BASE_URL` | yes | Public base URL (no trailing slash). Used for PayRex redirect URLs. |
| `PAYREX_SECRET_KEY` | no | PayRex **test** secret key. Leave empty to run in MOCK payment mode. |
| `PAYREX_PUBLIC_KEY` | no | PayRex test public key (currently unused server-side; reserved for client SDK if needed). |
| `PAYREX_WEBHOOK_SECRET` | no | PayRex webhook signing secret. Set after registering the webhook in the PayRex dashboard. |
| `PAYMENT_MOCK_MODE` | no | `true` forces mock mode even if PayRex keys are present. Default: `true`. |

**Mock mode** is enabled by default (`PAYMENT_MOCK_MODE=true`). In this
mode, no real payment is processed — the booking flow simulates a PayRex
checkout at `/book/mock-checkout` and auto-marks the reservation fee as
paid when the customer clicks "Simulate successful payment". This lets you
exercise the entire booking pipeline without PayRex credentials.

---

## 4. Database

The schema and database functions are defined in
`supabase/migrations/20261110100000_initial_schema.sql`. Apply schema
changes through versioned migrations with `supabase db push`.

### Tables

| Table | Purpose |
|---|---|
| `services`, `service_variants` | Service catalogue, prices, durations and variants. |
| `service_areas` | Service areas and one-way travel times. |
| `customers` | Customer details (one record per booking). |
| `bookings` | Appointment, status, payment deadline and immutable booking totals. |
| `booking_items` | Service snapshots (price and duration frozen at booking time). |
| `payments` | PayRex checkout/payment records. |
| `admin_users` | Allowlist of Supabase Auth user IDs permitted to administer bookings. |

Foreign keys, check constraints, supporting indexes, timestamp triggers and
an exclusion constraint for overlapping active slots are installed by the
migration. Booking creation, payment completion, cleanup and admin status
changes use transaction-backed PostgreSQL functions. Public users may read
the service catalogue and areas; customer, booking and payment tables have
RLS enabled with no direct `anon`/`authenticated` access. The service-role
key is used only in server-side handlers; admin handlers additionally
require the server-side Auth allowlist check.

### Common commands

```bash
supabase db push           # apply pending PostgreSQL migrations
bun run db:seed            # upsert catalogue + service areas
bun run db:reset-bookings  # delete bookings/payments/customers (DESTRUCTIVE)
```

### Seeding

`scripts/seed.ts` upserts the service areas and catalogue. Existing bookings,
customers and the admin allowlist are not touched. It requires the
server-only service-role key.


---

## 5. PayRex sandbox configuration

1. Sign in to the PayRex merchant dashboard in **test mode**
   (`https://merchants.payrex.com/`).
2. Copy your **Test Secret Key** and put it in `.env` as `PAYREX_SECRET_KEY`.
3. Set `PAYMENT_MOCK_MODE=false` to use PayRex instead of the default
   mock checkout.
4. Restart the dev server: `bun run dev`.
5. Walk through `/book` — you'll be redirected to a real PayRex hosted
   checkout page.

### Webhook registration

PayRex sends server-to-server webhook events when a payment succeeds (or
fails). The receiver endpoint is:

```
POST https://YOUR_PUBLIC_URL/api/webhooks/payrex
```

**Local development steps:**

1. Expose the local server with an HTTPS tunnel:

   ```bash
   # option A — ngrok
   ngrok http 3000

   # option B — Cloudflare quick tunnel
   cloudflared tunnel --url http://localhost:3000
   ```

2. In the PayRex dashboard (test mode), go to **Settings → Webhooks** and
   add a new webhook with the URL `https://<your-tunnel>.dev/api/webhooks/payrex`.
3. Subscribe to the following events (current PayRex event names):
   - `checkout_session.paid`
   - `payment.succeeded`
   - `payment.failed`
4. PayRex will show you a **Signing Secret**. Copy it and put it in `.env`
   as `PAYREX_WEBHOOK_SECRET`. (Replace `your_webhook_secret_here`.)
5. Restart the dev server. The webhook handler will now verify the
   HMAC-SHA256 signature of every incoming event.

> The webhook handler is implemented and safe to call even before the
> signing secret is configured — it returns `401 Invalid signature` for
> unsigned requests. Until then, the booking system relies on the
> success redirect + the **timeout cleaner** to mark bookings paid or
> cancelled.

### Payment timeout

When a customer starts payment, the booking's slot is **temporarily
reserved** for 10 minutes (`paymentDeadline` column). If no successful
webhook arrives within 10 minutes, the timeout cleaner checks the actual
PayRex Checkout Session state:

- If PayRex says the session is paid → mark the booking **Paid**.
- If PayRex says the session is unpaid / expired → mark the booking
  **Cancelled** with reason `payment_timeout` and release the slot.
- If PayRex state is uncertain → leave the slot reserved (the timeout
  cleaner will retry on the next request).

The timeout cleaner runs **opportunistically** every time the
availability endpoint is called, and can also be triggered manually
from the admin dashboard (the "Run cleanup" button) or by
`POST /api/admin/cleanup`.

---

## 6. Running locally

```bash
bun run dev      # http://localhost:3000
bun run lint     # ESLint
bun run build    # production build
```

There is no separate backend process — all routes (pages, APIs, webhooks)
are served by the Next.js dev server on port 3000.

---

## 7. Deployment

The app is a standard Next.js 16 project and deploys to Vercel, Netlify,
or any Node host without changes.

1. Set the Supabase URL and anon key in the build and runtime environment,
   and the service-role key in the server runtime environment. Keep the
   service-role key private and server-only.
2. Apply pending SQL migrations to the production Supabase project and
   create/allowlist JESS's Supabase Auth user.
3. Make sure your public URL is reachable by PayRex's webhook sender.
4. Register the production webhook URL
   (`https://yourdomain.com/api/webhooks/payrex`) in the PayRex dashboard
   and copy the production signing secret into `PAYREX_WEBHOOK_SECRET`.

---

## 8. Supabase access model

- The browser uses only the Supabase anon key for Supabase Auth. There is
  no direct browser access to customer, booking, booking-item or payment
  records.
- Admin routes verify the Supabase Auth user on the server and require a
  matching `public.admin_users.user_id` before using privileged database
  operations.
- Service-role database access is confined to server-side modules and
  scripts. Never expose or use `SUPABASE_SERVICE_ROLE_KEY` in client code.
- The RLS policies and function grants are installed by the migration.
  Public catalogue reads are permitted; private booking data and mutation
  functions are unavailable to `anon` and `authenticated` database roles.
- PayRex credentials and webhook signature verification remain server-side.

---

## 9. Security features

- ✅ All prices are recalculated server-side from the database; the
  browser never supplies a price or reservation fee.
- ✅ Booking-combination rules enforced on the client *and* the server.
- ✅ Slot reservation uses a PostgreSQL exclusion constraint and a
  transaction-backed booking RPC to prevent overlapping active bookings,
  including concurrent requests.
- ✅ Temporary 10-minute payment deadline; expired pending bookings are
  released atomically.
- ✅ Webhook signature verification (HMAC-SHA256) — fake webhooks are
  rejected with 401.
- ✅ Webhook handler is idempotent (a duplicate `successful` event is a
  no-op).
- ✅ Amount verification: the webhook refuses to mark a booking Paid if
  the paid amount doesn't match the reservation fee.
- ✅ Admin pages and API endpoints validate the Supabase Auth user and the
  server-side admin allowlist before accessing protected operations.
- ✅ Marking a booking **Completed** does NOT release the reserved time
  block (JESS can't free a slot early by completing).
- ✅ Cancelling a **Paid** booking is allowed (JESS-initiated) but
  preserves the payment history.
- ✅ Cancelling a **Pending** booking that has a successful payment is
  blocked — the booking is flipped to Paid instead.
- ✅ Service-role / secret credentials live only in server-side
  environment variables; nothing secret is exposed to the browser.
- ✅ `.env*` is in `.gitignore`.

---

## 10. Current limitations & unresolved business decisions

1. **PayRex live testing not performed.** The integration is implemented
   and sandbox-ready, but no real payment was processed during this
   implementation phase. Use the `.env` `PAYREX_SECRET_KEY` +
   `PAYREX_WEBHOOK_SECRET` to enable live sandbox testing.
2. **Mock payment mode is on by default.** Set `PAYMENT_MOCK_MODE=false`
   and provide `PAYREX_SECRET_KEY` to switch to PayRex checkout.
3. **Haircut additional-time rule.** The brief notes that the exact
   additional time for extra haircut customers has not been finalized.
   The current rule (see `src/lib/pricing.ts → priceHaircutLine`) bills
   each additional person at ₱500 with **1 hour per person** of duration.
   This is documented in code and easy to change in one place.
4. **Hair Color Correction.** The brief specifies the displayed price is
   ₱5,991 but the final pricing may depend on length/complexity. The
   catalogue stores ₱5,991 and the service `note` field carries the
   explanation. The final pricing rule requires confirmation from JESS.
5. **Toupee Haircut & Hair Blending.** The brief asks to confirm their
   booking category. They are treated as **haircut units** for the
   booking-combination rule (so they count toward the 5-haircut cap and
   the "1 haircut + 1 major" rule). This assumption is documented in
   `src/lib/catalogue.ts`.
6. **Address-to-area verification.** The brief explicitly allows a
   customer-selected area + clear address confirmation rather than
   automatic geocoding. We follow that — the customer picks the area
   and types their address; JESS verifies it manually.
7. **No refund system.** The reservation fee is non-refundable per the
   salon's stated policy. No refund buttons or endpoints exist.
8. **Group booking (20–30 people).** Not supported by the system. The
   booking UI shows a "Planning a group appointment? Please contact
   JESS directly." hint.
9. **Webhook event retries.** PayRex retries failed webhook deliveries;
   our handler is idempotent so retries are safe.
10. **Production cleanup schedule.** Expired payment locks are cleaned on
    availability checks and can be released manually from the admin
    dashboard. A production scheduler may be added later if request-driven
    cleanup is insufficient.

---

## 11. Project structure

```
supabase/
  migrations/                               # PostgreSQL schema, RLS and RPC functions
scripts/
  seed.ts                                    # catalogue + service areas seed
src/
  app/
    page.tsx                                 # Home
    services/page.tsx                        # Services
    about/page.tsx                           # About
    book/
      page.tsx                               # 4-step booking flow
      result/page.tsx                        # success / pending / cancelled
      mock-checkout/page.tsx                 # simulated PayRex checkout
    admin/
      page.tsx                               # session guard
      login/page.tsx                         # Supabase Auth sign-in
    api/
      areas/route.ts
      services/route.ts
      availability/route.ts
      bookings/
        create/route.ts
        [ref]/route.ts
        mock-succeed/route.ts
        by-session/route.ts
      webhooks/payrex/route.ts
      admin/
        bookings/route.ts
        bookings/[id]/complete/route.ts
        bookings/[id]/cancel/route.ts
        cleanup/route.ts
  components/
    site-shell.tsx                           # public header/footer
    admin-dashboard.tsx                      # admin tabs + actions
    ui/                                      # shadcn/ui primitives
  lib/
    auth.ts                                  # Supabase Auth + admin allowlist check
    booking-rules.ts                         # combination rules (pure logic)
    catalogue.ts                             # seed data (server-only)
    db.ts                                    # server-only Supabase service client
    supabase/                                # browser/server Auth clients
  proxy.ts                                   # refreshes Supabase Auth cookies
    payrex.ts                                # PayRex client + webhook verify
    pricing.ts                               # server-authoritative pricing
    scheduling.ts                            # availability + timeout cleanup
    types.ts                                 # client-safe DTOs + formatters
```

---

## 12. Final notes

- **Existing website preserved.** The homepage, services page, and
  visual identity are unchanged from the original React+Vite site. The
  original Contact page content was reorganised into the About page,
  and a dedicated Book page replaces the old manual Messenger+GCash
  flow.
- **Mobile-first.** Every page is touch-friendly. The booking flow
  works on phones, tablets, and desktops.
- **Admin is private.** There is no public link to `/admin`. JESS
  navigates there directly.
- **No overengineering.** No queues, no message bus, no microservices.
  One Next.js app, one Supabase project, one PayRex integration.

— Built for JESS.
