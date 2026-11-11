# JESS Salon at Home

Salon-quality hair services, brought to your doorstep. A complete, deployment-ready
booking website for **JESS Salon at Home** (Batasan Hills, Quezon City, Philippines).

Customers browse the service menu, pick services, choose a service area, select an
available time, and pay a reservation fee online via **PayRex Hosted Checkout**. The
remaining balance is paid in cash at the appointment. JESS manages bookings through a
private admin dashboard secured by **Supabase Auth**.

This is a real application — not a demo. It uses a real Supabase database and real
PayRex payment verification. If required credentials are missing, the app shows a
clear configuration error instead of pretending a payment succeeded.

---

## Table of contents

1. [Tech stack](#tech-stack)
2. [Project structure](#project-structure)
3. [Quick start (local development)](#quick-start-local-development)
4. [Supabase setup](#supabase-setup)
5. [PayRex setup](#payrex-setup)
6. [Environment variables](#environment-variables)
7. [Slot-lock cleanup (cron)](#slot-lock-cleanup-cron)
8. [Deployment](#deployment)
9. [Business rules reference](#business-rules-reference)
10. [Testing](#testing)

---

## Tech stack

| Layer | Technology |
|------|-----------|
| Framework | **Next.js 16** (App Router, Turbopack) with **TypeScript 5** |
| Styling | Tailwind CSS 4 + a hand-written JESS stylesheet (black / cream / gold) preserving the original design |
| UI components | shadcn/ui (used only in shared primitives) |
| Database | **Supabase PostgreSQL** with **Row Level Security (RLS)** |
| Auth | **Supabase Auth** (email + password, admin only) |
| Payments | **PayRex Hosted Checkout** with verified webhooks |
| Package manager | **npm** (this project uses npm scripts and `package.json`) |

> The original website was a Vite + React Router SPA. It has been migrated to
> Next.js because the task requires server-side API routes (booking creation,
> payment verification, webhooks, admin authorization). All original design
> (CSS, fonts, images, content, the service catalogue) is preserved.

---

## Project structure

```
.
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (loads fonts + JESS CSS)
│   │   ├── globals.css             # Tailwind + shadcn theme tokens
│   │   ├── jess.css                # Original JESS visual design (preserved)
│   │   ├── (site)/                 # Public site (with header + footer)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Home
│   │   │   ├── services/page.tsx   # Services (catalogue)
│   │   │   ├── about/page.tsx      # About + contact
│   │   │   └── book/
│   │   │       ├── page.tsx        # 5-step booking flow
│   │   │       └── confirmation/   # Payment result page
│   │   ├── admin/                  # Private dashboard (auth-gated)
│   │   │   ├── login/page.tsx
│   │   │   └── page.tsx            # Pending / Paid / Completed tabs
│   │   └── api/
│   │       ├── bookings/           # availability, create, [id] status, cleanup
│   │       ├── webhooks/payrex/    # PayRex webhook receiver
│   │       └── admin/              # bookings list + actions, session
│   ├── components/
│   │   ├── site/                   # Header, footer, shared UI
│   │   ├── services-content.tsx    # Services accordion
│   │   └── booking/                # Booking form + styles
│   ├── lib/
│   │   ├── catalogue.ts            # SERVICE CATALOGUE (source of truth)
│   │   ├── booking.ts              # Pricing, combinations, scheduling (pure)
│   │   ├── booking-server.ts       # Server booking ops (Supabase, slot lock)
│   │   ├── payrex.ts               # PayRex checkout + webhook verification
│   │   ├── env.ts                  # Typed env access + config errors
│   │   └── supabase/
│   │       ├── server.ts           # Service-role + auth clients
│   │       └── browser.ts          # Browser client (anon, auth only)
│   └── proxy.ts                    # Auth guard for /admin (Next.js 16 proxy)
├── supabase/migrations/
│   ├── 0001_init.sql               # Schema (bookings, webhook_events)
│   └── 0002_rls.sql                # RLS + is_admin() + app_config
├── public/imgs/                    # Original site images (preserved)
├── tests/booking.test.ts           # Unit tests for business logic
├── .env.example                    # All env vars (placeholders only)
└── package.json
```

---

## Quick start (local development)

### Requirements

- **Node.js 20+** (Node 18 is the minimum; 20 LTS is recommended)
- **npm** (comes with Node.js)
- A Supabase project (see [Supabase setup](#supabase-setup))
- A PayRex account (see [PayRex setup](#payrex-setup))

### Install & run

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your real Supabase + PayRex values (see below)
npm run dev
```

The app runs at **http://localhost:3000**.

### Other scripts

```bash
npm run lint     # ESLint (Next.js + TypeScript rules)
npm run build    # Production build
npm test         # Unit tests for business logic (pricing, scheduling, combos)
```

> The dev server prints logs to `dev.log` for convenience.

---

## Supabase setup

### 1. Create a project

1. Go to <https://supabase.com> and create a new project.
2. Wait for provisioning to finish.

### 2. Apply the database migrations

The schema and RLS policies are in `supabase/migrations/`. Apply them in order
using the Supabase SQL Editor (Dashboard → SQL Editor → New query), paste the
contents of each file, and run:

1. `supabase/migrations/0001_init.sql` — creates `bookings` and `webhook_events`
   tables, indexes, and the `updated_at` trigger.
2. `supabase/migrations/0002_rls.sql` — enables RLS, creates the `is_admin()`
   helper, the `app_config` table, and all RLS policies.

You can re-run each file safely (they use `IF NOT EXISTS` / `DROP ... IF EXISTS`).

### 3. Find your project URL and keys

Dashboard → **Project Settings** → **API**:

- **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
- **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- **service_role** secret → `SUPABASE_SERVICE_ROLE_KEY` (server-only — never
  expose in the browser)

### 4. Create JESS's admin account

1. Dashboard → **Authentication** → **Users** → **Add user**.
2. Enter JESS's email and a strong password. Enable "Auto Confirm User".
3. Copy the new user's **UID** (the long UUID).

### 5. Register JESS as the admin

Open the SQL Editor and run (replace the UUID with JESS's user id from step 4):

```sql
INSERT INTO app_config (id, admin_user_id)
VALUES (1, 'PASTE-JESS-USER-UID-HERE')
ON CONFLICT (id) DO UPDATE SET admin_user_id = EXCLUDED.admin_user_id;
```

This is the single row the `is_admin()` RLS function checks. Only this user can
read or modify bookings through the application flow.

### 6. Verify RLS

- Open the table editor for `bookings` while **not** signed in (or as a non-admin
  user) — you should see no rows. RLS blocks all access except via the admin
  session or the service-role key (server-side).
- Sign in at `/admin/login` with JESS's email + password — you should reach the
  dashboard.

---

## PayRex setup

This integration follows the **current official PayRex documentation**
(<https://docs.payrex.com>), cross-verified against the official `payrex-node` SDK.

### 1. Obtain your API credentials

Dashboard → **Developers** (at <https://dashboard.payrexhq.com>):

- **Secret API key** (`sk_...`) → `PAYREX_SECRET_API_KEY` (server-only)
- Test and live mode share the same API host (`https://api.payrexhq.com`);
  which key you use determines the mode.

### 2. Register the webhook endpoint

1. Dashboard → **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL:** `https://YOUR-DOMAIN/api/webhooks/payrex`
   - Must be a public **HTTPS** URL (PayRex posts to it from their servers).
   - For local development use a tunnel (e.g. ngrok, Cloudflare Tunnel) pointing
     at `http://localhost:3000`.
3. **Subscribe to events** (per official docs):
   - `payment_intent.succeeded` — the primary success event.
   - `payment.paid` — also emitted on success (optional but recommended).
4. Save. Copy the **Webhook signing secret** (`whsk_...`) →
   `PAYREX_WEBHOOK_SECRET_KEY` (server-only).

### 3. How payment verification works

- The success redirect URL is **not** proof of payment.
- Payment is confirmed **only** by a verified webhook signature (HMAC-SHA256 of
  `"<timestamp>.<raw_body>"` with the `whsk_` secret, compared against the
  `li`/`te` parts of the `Payrex-Signature` header), **and** a server-side
  retrieve of the checkout session confirming `payment_intent.status === "succeeded"`.
- Webhook events are deduplicated by their `evt_...` id (stored in
  `webhook_events`) so re-deliveries are safe.

> See `src/lib/payrex.ts` for the exact signature algorithm and
> `src/app/api/webhooks/payrex/route.ts` for the handler.

---

## Environment variables

All variables are listed in `.env.example`. Copy it to `.env.local` (development)
or `.env` (production) and fill in real values.

| Variable | Public? | Required | Purpose | Where to get it |
|----------|---------|----------|---------|-----------------|
| `NEXT_PUBLIC_SITE_URL` | yes | yes | Base URL of the deployed site (no trailing slash). Used for PayRex success/cancel redirect URLs. | Your deployment URL |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Supabase project URL. | Supabase Dashboard → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | yes | Supabase anon key (safe for browser; RLS applies). | Supabase Dashboard → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | yes | Supabase service-role key — bypasses RLS. Server-only. Never expose in the browser. | Supabase Dashboard → Settings → API → service_role |
| `PAYREX_SECRET_API_KEY` | **secret** | yes | PayRex secret API key (test or live). | PayRex Dashboard → Developers |
| `PAYREX_WEBHOOK_SECRET_KEY` | **secret** | yes | PayRex webhook signing secret (`whsk_...`). | PayRex Dashboard → Developers → Webhooks |
| `CLEANUP_API_KEY` | **secret** | yes | Shared secret protecting the cleanup cron endpoint. Generate a long random string. | You generate it |

**Never commit real secrets.** `.env.example` contains placeholders only.

---

## Slot-lock cleanup (cron)

When a customer starts payment, the selected slot is locked for **10 minutes**.
If payment is not completed in that window, the pending booking must be
cancelled so the slot is released.

This cleanup **must run reliably in production** — it cannot depend on someone
opening the booking page. Configure a scheduled job that calls:

```
POST https://YOUR-DOMAIN/api/bookings/cleanup
Authorization: Bearer <CLEANUP_API_KEY>
```

**Recommended: every 1 minute.**

Options:
- **Vercel Cron** (if deploying on Vercel): add to `vercel.json` a cron with
  `path: "/api/bookings/cleanup"` and a header — Vercel Cron sends
  `Authorization: Bearer <CRON_SECRET>`. Set `CRON_SECRET` = `CLEANUP_API_KEY`.
- **Supabase Edge Functions `pg_cron`**: schedule a `net.http_post` to the
  cleanup endpoint every minute.
- **Any external cron** (GitHub Actions, cron-job.org, etc.) hitting the endpoint.

The cleanup is safe to run repeatedly and is idempotent. For each expired pending
booking it **verifies the payment with PayRex first** — if the payment actually
succeeded (late webhook), it marks the booking paid instead of cancelling. If
PayRex cannot be reached, the slot stays locked and the next run retries. This
prevents a paid booking from ever being cancelled by a timeout.

---

## Deployment

### Production environment variables

Set all variables from the [Environment variables](#environment-variables) table
in your hosting provider's environment settings (e.g. Vercel project settings).

### Production checklist

1. **Database** — Apply both SQL migration files to your production Supabase
   project. Create JESS's auth account and register her UID in `app_config`.
2. **RLS** — Verify policies are active (Dashboard → Authentication → Policies).
3. **PayRex** — Use **live** API key + live webhook signing secret. Register the
   production webhook URL (`https://YOUR-DOMAIN/api/webhooks/payrex`) and
   subscribe to `payment_intent.succeeded` (and optionally `payment.paid`).
4. **Webhook URL** — Must be public HTTPS.
5. **Cleanup cron** — Configure a 1-minute cron hitting
   `/api/bookings/cleanup` with `Authorization: Bearer <CLEANUP_API_KEY>`.
6. **Site URL** — `NEXT_PUBLIC_SITE_URL` must be your production HTTPS URL.
7. **Build** — `npm run build` then deploy. (On Vercel, the build is automatic.)

### Build command

```bash
npm run build
```

---

## Business rules reference

These are enforced in `src/lib/booking.ts` (pure, shared by client & server)
and re-validated server-side in `src/lib/booking-server.ts`.

### Service combinations (one booking)

- Up to **5 haircuts** alone.
- **1 haircut + 1 major service**.
- **1 or 2 major services** alone (no haircut).

Everything else is rejected. The booking UI disables incompatible selections
dynamically and explains why.

### Pricing

- Haircuts: first person **₱999**, each additional person **+₱500**. Duration
  1 hour per person.
- Major services: price & duration depend on the chosen variant (length/option).
- **Reservation fee**: ₱500 per haircut/person + ₱1,500 per major service.
- Remaining balance = total price − reservation fee (paid in cash).
- The reservation fee is **non-refundable**.

### Scheduling

- JESS works **8:00 AM – 6:00 PM** daily (10-hour window).
- The customer-selected time is JESS's **departure time** from base
  (Batasan Hills, QC), not her arrival time.
- Total committed time = service duration + one-way travel time, **rounded up
  to the next full hour**.
- Departure times are on **fixed one-hour intervals**.
- The entire committed block must fit within 8 AM – 6 PM.
- Only one appointment at a time; multiple per day allowed if non-overlapping.

### Travel times (one-way)

| Area | Travel |
|------|--------|
| Metro Manila | 1.5 h |
| Cavite | 2 h |
| Laguna | 2 h |
| Batangas | 3 h |

### Reservation fee

- ₱500 per haircut/person
- ₱1,500 per major service/person

### Slot lock

- 10 minutes during checkout. Verified payment → paid. Unpaid/failed/expired
  after 10 min → cancelled (`payment_timeout`) and slot released.

---

## Testing

Unit tests cover the pure business logic (no database, no network, no mocks of
external services):

```bash
npm test
```

Tests verify: service combination rules, haircut pricing model, reservation
fee calculation, duration rounding, scheduling (working-window fit, overlap
detection, slot availability), and catalogue integrity.

> Live Supabase, PayRex, webhook, and end-to-end payment functionality were
> **not** tested locally because they require real configured credentials.
> The app shows clear configuration errors when credentials are absent.

---

## Notes & assumptions

- **Framework migration:** the original Vite SPA was migrated to Next.js 16
  (App Router) because server-side API routes are required for booking creation,
  PayRex verification, webhooks, and admin authorization. All original design,
  content, images, fonts, and the service catalogue are preserved.
- **Service classification:** every service outside the "Haircuts" category is
  treated as a **major service** (including Toupee styling, Massage and Modern
  Ventosa, which live in their own categories with their own pricing).
- **Haircut pricing** uses the existing site's model: ₱999 for the first person,
  +₱500 for each additional person (a volume discount), 1 hour per person.
- **No customer accounts:** customers book as guests. Only JESS authenticates.
- **No refund system:** the reservation fee is non-refundable; the app does not
  implement refunds.
- **Cancelled bookings** remain in the database for history; they do not appear
  in the three main dashboard tabs.
- The service catalogue is kept in code (`src/lib/catalogue.ts`), not in the
  database, since no new services are being added.
