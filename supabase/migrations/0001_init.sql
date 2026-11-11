-- =====================================================================
-- JESS Salon at Home — Schema initialization (migration 0001)
-- =====================================================================
-- Creates the core tables for the booking system:
--   * bookings        — customer bookings + payment + scheduling
--   * webhook_events  — PayRex webhook idempotency log
--
-- Application model (see src/lib/catalogue.ts and src/lib/booking.ts):
--   * The service catalogue lives in code, NOT in the database.
--   * Customers book WITHOUT an account (guest booking). Only the admin
--     (JESS) authenticates, via Supabase Auth.
--   * Prices, durations and scheduling are computed server-side and
--     stored on the booking row for history / audit.
--   * Payments use PayRex Hosted Checkout. A webhook verifies payment.
--   * Booking lifecycle:
--       pending  -> paid       (payment verified via PayRex webhook)
--       paid     -> completed  (JESS marks the appointment done)
--       pending  -> cancelled  (payment_timeout : 10-min slot lock
--                                expired without payment)
--       paid     -> cancelled  (admin_cancellation : JESS cancels)
--
-- Idempotency:
--   * CREATE TABLE IF NOT EXISTS is used throughout.
--   * CREATE EXTENSION IF NOT EXISTS for pgcrypto.
--   * Triggers use DROP TRIGGER IF EXISTS before CREATE TRIGGER.
--   * The set_updated_at() function uses CREATE OR REPLACE.
-- This file can be re-run on a fresh project without errors.
-- =====================================================================

-- pgcrypto provides gen_random_uuid() (Supabase pre-enables this, but
-- declaring it here keeps the migration self-sufficient / portable).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- set_updated_at() — trigger function
-- =====================================================================
-- Generic BEFORE UPDATE trigger function that bumps the row's
-- updated_at column to now(). Used by the `bookings` table below.
--
-- It is intentionally SECURITY INVOKER (the default) and language
-- plpgsql so the function body is NOT validated at CREATE time — this
-- means it can be defined before any table that uses it.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'BEFORE UPDATE trigger helper: refreshes the row''s updated_at timestamp.';

-- =====================================================================
-- bookings
-- =====================================================================
-- One row per booking request.
--
-- Customer details are captured at booking time. Customers do NOT have
-- Supabase Auth accounts; they are guests. Only the admin (JESS) logs
-- in to read/manage bookings.
--
-- All money columns are whole pesos (PHP) stored as integer.
-- Time-block columns (block_start_min / block_end_min) are minutes
-- from midnight in JESS's local timezone (Asia/Manila), matching the
-- integer-minute math used in src/lib/booking.ts.
CREATE TABLE IF NOT EXISTS public.bookings (
  -- ---- Identity ------------------------------------------------------
  -- Primary identifier (UUID). Used in URLs, foreign keys, webhooks.
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Human-readable booking reference, e.g. "JESS-AB12CD".
  -- Generated server-side and passed in on insert.
  reference text NOT NULL UNIQUE,

  -- ---- Lifecycle -----------------------------------------------------
  -- Booking status. See header comment for the state machine.
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','completed','cancelled')),

  -- Why the booking was cancelled. NULL when not cancelled.
  cancellation_reason text NULL
    CHECK (cancellation_reason IS NULL
           OR cancellation_reason IN ('admin_cancellation','payment_timeout')),

  -- Optional free-text note from JESS when she cancels a booking.
  cancellation_note text NULL,

  -- ---- Customer details (collected at booking, no auth) --------------
  customer_name    text NOT NULL,
  customer_email   text NOT NULL,
  customer_mobile  text NOT NULL,
  service_address  text NOT NULL,

  -- service_area_id mirrors the ids defined in SERVICE_AREAS in
  -- src/lib/catalogue.ts ('metro-manila','cavite','laguna','batangas').
  service_area_id text NOT NULL
    CHECK (service_area_id IN ('metro-manila','cavite','laguna','batangas')),

  -- Denormalized label (e.g. "Metro Manila") so historical bookings
  -- remain readable even if the catalogue is later edited.
  service_area_label text NOT NULL,

  -- ---- Services (trusted server-side, never from browser) -----------
  haircut_quantity integer NOT NULL DEFAULT 0
    CHECK (haircut_quantity >= 0),

  -- Optional free-text notes from the customer about their hair / the
  -- haircut types they want (one string covers the whole booking).
  haircut_type_notes text NULL,

  -- JSON array of major-service selections. Each element is an object
  -- shaped like:
  --   { "serviceId": "...", "variantId": "...", "name": "...",
  --     "variantLabel": "...", "price": 2500, "durationHours": 3 }
  -- Prices/durations inside this JSON are server-copied from the
  -- catalogue for historical display. The CHECK below only enforces
  -- that the value is a JSON array; structure is validated server-side
  -- before insert.
  major_selections jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(major_selections) = 'array'),

  -- ---- Pricing (all server-calculated, stored for history) -----------
  -- All amounts are whole pesos (PHP).
  total_price        integer NOT NULL CHECK (total_price >= 0),
  reservation_fee    integer NOT NULL CHECK (reservation_fee >= 0),
  remaining_balance  integer NOT NULL CHECK (remaining_balance >= 0),

  -- ---- Scheduling ----------------------------------------------------
  -- The local date the appointment is scheduled for.
  appointment_date date NOT NULL,

  -- Hour JESS leaves base (8..18). Stored as an integer hour-of-day.
  -- 8 = 08:00, 18 = 18:00. Working window is 8:00–18:00 daily.
  departure_hour integer NOT NULL
    CHECK (departure_hour BETWEEN 8 AND 18),

  -- Rounded-up total block length (service + travel), in whole hours.
  -- Always >= 1 because travel alone is at least ~1h.
  committed_hours integer NOT NULL CHECK (committed_hours >= 1),

  -- One-way travel time (e.g. 1.5, 2.0, 3.0). Up to 1 decimal place.
  travel_hours numeric(3,1) NOT NULL CHECK (travel_hours >= 0),

  -- Total service hours (sum of selected service durations).
  -- Up to 2 decimal places (e.g. 7.25).
  service_hours numeric(5,2) NOT NULL CHECK (service_hours >= 0),

  -- The reserved time block, in minutes from midnight (local time).
  --   block_start_min = departure_hour * 60
  --   block_end_min   = block_start_min + committed_hours * 60
  -- Stored denormalized so the double-booking / overlap check is a
  -- simple range comparison: a proposed block [s,e) overlaps an
  -- existing block when s < existing.end_min AND existing.start_min < e.
  block_start_min integer NOT NULL CHECK (block_start_min >= 0),
  block_end_min   integer NOT NULL CHECK (block_end_min > block_start_min),

  -- Integrity checks: ensure the stored block matches its definition.
  -- These catch buggy server-side math; application code always sets
  -- these columns consistently so the checks will hold.
  CHECK (block_start_min = departure_hour * 60),
  CHECK (block_end_min   = block_start_min + committed_hours * 60),

  -- A cancelled booking must carry a cancellation_reason. (paid/pending
  -- rows that flip to 'cancelled' must set the reason in the same
  -- UPDATE — the application always does this atomically.)
  CHECK (
    (status = 'cancelled' AND cancellation_reason IS NOT NULL)
    OR status <> 'cancelled'
  ),

  -- ---- Payment (PayRex Hosted Checkout) -------------------------------
  -- PayRex checkout session id, e.g. "cs_...". Set when the booking is
  -- created and the checkout session is opened.
  checkout_session_id text NULL,
  -- PayRex hosted checkout URL the customer is redirected to.
  checkout_url text NULL,
  -- PayRex payment intent id (pi_...) or payment id, once paid.
  payment_reference text NULL,
  -- When the webhook confirmed payment (status moved to 'paid').
  payment_verified_at timestamptz NULL,

  -- ---- Slot lock ------------------------------------------------------
  -- 10-minute temporary lock (SLOT_LOCK_MINUTES = 10 in catalogue.ts)
  -- to prevent double-booking while the customer is at the PayRex
  -- checkout page. Only meaningful for 'pending' bookings. The
  -- server sets this to (now() + 10 minutes) on booking creation and
  -- clears it (sets NULL) once the booking is paid or cancelled.
  lock_expires_at timestamptz NULL,

  -- ---- Timestamps -----------------------------------------------------
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz NULL,
  completed_at timestamptz NULL
);

COMMENT ON TABLE public.bookings IS
  'JESS Salon at Home — customer bookings (guest bookings, no customer auth).';

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
-- Look up bookings for a specific date+status (admin calendar view).
CREATE INDEX IF NOT EXISTS idx_bookings_appointment_date_status
  ON public.bookings (appointment_date, status);

-- Filter bookings by status (admin dashboard lists).
CREATE INDEX IF NOT EXISTS idx_bookings_status
  ON public.bookings (status);

-- Webhook lookup: find a booking by its PayRex checkout session id.
-- Partial index since most rows have NULL checkout_session_id.
CREATE INDEX IF NOT EXISTS idx_bookings_checkout_session_id
  ON public.bookings (checkout_session_id)
  WHERE checkout_session_id IS NOT NULL;

-- Sweep for expired pending slot locks (payment_timeout job).
-- Only pending bookings can have a live lock.
CREATE INDEX IF NOT EXISTS idx_bookings_lock_expires_pending
  ON public.bookings (lock_expires_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- Trigger: keep updated_at fresh on every UPDATE.
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bookings_set_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- webhook_events (idempotency)
-- =====================================================================
-- Stores every PayRex webhook event id we have already processed, so
-- re-deliveries (PayRex retries on transient failures) are detected
-- and skipped. The PRIMARY KEY on `id` (the PayRex event id, e.g.
-- "evt_...") is what guarantees idempotency: a duplicate INSERT fails
-- with a unique violation, which the server treats as "already
-- processed" and returns 200 OK without re-running side effects.
--
-- `booking_id` is nullable because some webhook events (e.g. test
-- pings, or events for abandoned checkouts) may not map cleanly to a
-- booking. ON DELETE SET NULL keeps the audit trail even if a booking
-- is hard-deleted by the admin.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  -- PayRex event id, e.g. "evt_...". PRIMARY KEY enforces uniqueness.
  id text PRIMARY KEY,

  -- PayRex event type, e.g. "payment.paid", "payment.failed".
  event_type text NOT NULL,

  -- The booking this event relates to, if any. SET NULL on booking
  -- deletion so the audit trail survives.
  booking_id uuid NULL REFERENCES public.bookings(id) ON DELETE SET NULL,

  -- When we processed the event.
  processed_at timestamptz NOT NULL DEFAULT now(),

  -- Optional raw payload for audit / debugging.
  payload jsonb NULL
);

COMMENT ON TABLE public.webhook_events IS
  'PayRex webhook idempotency log — one row per processed event id.';
