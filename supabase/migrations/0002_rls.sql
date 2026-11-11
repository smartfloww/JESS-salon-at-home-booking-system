-- =====================================================================
-- JESS Salon at Home — Row Level Security (migration 0002)
-- =====================================================================
-- This migration:
--   1. Creates the is_admin() helper function (SECURITY DEFINER).
--   2. Creates the app_config table (single row, holds JESS's auth uid).
--   3. Enables RLS on bookings, webhook_events and app_config.
--   4. Creates restrictive policies: NO public access; admin-only.
--
-- Ordering matters: is_admin() must exist BEFORE any policy that
-- references it, and app_config must exist before is_admin() is ever
-- called (but NOT before it is defined — see note on language below).
-- We therefore define in this order:
--     a) is_admin() function
--     b) app_config table
--     c) ALTER TABLE ... ENABLE ROW LEVEL SECURITY
--     d) CREATE POLICY ...
--
-- Threat model:
--   * anon and authenticated roles can reach the database through the
--     Supabase PostgREST API. With RLS enabled and no matching policy,
--     access is DENIED by default. The policies below are the ONLY way
--     client requests can read or write data.
--   * The service-role key (used by the Next.js server) bypasses RLS
--     entirely, so server-side writes — booking creation, webhook
--     handling, slot-lock sweeps — are unaffected by these policies.
--
-- Idempotency:
--   * CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION, and
--     DROP POLICY IF EXISTS before CREATE POLICY. Re-running on a
--     fresh project is safe.
-- =====================================================================

-- =====================================================================
-- is_admin() helper
-- =====================================================================
-- Returns TRUE when the current Supabase Auth user is the configured
-- admin (JESS), identified by admin_user_id in app_config (id = 1).
--
-- Returns FALSE (never NULL) when:
--   * the caller is not authenticated (auth.uid() IS NULL), OR
--   * app_config has no row yet (admin not configured), OR
--   * the caller's uid does not match admin_user_id.
--
-- Implementation notes:
--   * SECURITY DEFINER — runs with the table owner's privileges so it
--     can read app_config even when the calling role cannot (RLS on
--     app_config is admin-gated, so a plain authenticated user could
--     not otherwise read it — chicken-and-egg).
--   * STABLE — read-only; lets the planner cache results within a
--     single statement.
--   * SET search_path = public, pg_temp — security best practice for
--     SECURITY DEFINER functions; prevents search_path injection.
--   * LANGUAGE plpgsql — the body is parsed lazily (at first call),
--     so the function can be defined BEFORE the app_config table
--     exists. (LANGUAGE sql validates the body at CREATE time and
--     would fail because app_config does not exist yet.)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  admin_uid  uuid;
  caller_uid uuid;
BEGIN
  caller_uid := auth.uid();
  IF caller_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.admin_user_id INTO admin_uid
    FROM public.app_config c
    WHERE c.id = 1;

  RETURN admin_uid IS NOT NULL AND admin_uid = caller_uid;
END;
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Returns true when the current Supabase Auth user is the configured admin (JESS).';

-- =====================================================================
-- app_config
-- =====================================================================
-- Single-row configuration table (id is forced to 1). Holds the
-- Supabase Auth user id of JESS, the admin.
--
-- IMPORTANT — bootstrap steps:
--   1. JESS's admin account is created in the Supabase Auth dashboard
--      (or via the Auth admin API). It is NOT created by SQL.
--   2. After JESS's account exists, an operator with the service-role
--      key (which bypasses RLS) must seed app_config:
--
--        insert into public.app_config (admin_user_id)
--        values ('<JESS-supabase-auth-user-uuid>');
--
--      Until that row exists, is_admin() returns false for everyone
--      and the admin dashboard will show no data via client requests.
--      Server-side access via the service-role key still works.
CREATE TABLE IF NOT EXISTS public.app_config (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  admin_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_config IS
  'Single-row app configuration. Holds the admin (JESS) Supabase Auth user id.';

-- =====================================================================
-- Enable Row Level Security
-- =====================================================================
-- With RLS enabled and no matching policy, access is denied by
-- default. The policies below are the ONLY way non-service-role
-- requests can read or write data. The service-role key bypasses RLS.
ALTER TABLE public.bookings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config     ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Policies: bookings
-- =====================================================================
-- Booking creation and most writes happen server-side using the
-- service-role key, which bypasses RLS. These policies only govern
-- client (anon / authenticated) requests — and the only client that
-- ever needs access is JESS herself, identified by is_admin().

-- SELECT — admin calendar / dashboard reads.
-- Public/anon get nothing.
DROP POLICY IF EXISTS bookings_select_admin ON public.bookings;
CREATE POLICY bookings_select_admin
  ON public.bookings
  FOR SELECT
  TO authenticated, anon
  USING (public.is_admin());

-- INSERT — block client-side inserts. Booking creation is done
-- server-side (service role, bypasses RLS). If a client somehow
-- attempts an insert, require admin.
DROP POLICY IF EXISTS bookings_insert_admin ON public.bookings;
CREATE POLICY bookings_insert_admin
  ON public.bookings
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.is_admin());

-- UPDATE — admin marks bookings paid / completed / cancelled.
DROP POLICY IF EXISTS bookings_update_admin ON public.bookings;
CREATE POLICY bookings_update_admin
  ON public.bookings
  FOR UPDATE
  TO authenticated, anon
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE — admin can hard-delete a booking if ever needed (rare;
-- usually we cancel instead). Public/anon get nothing.
DROP POLICY IF EXISTS bookings_delete_admin ON public.bookings;
CREATE POLICY bookings_delete_admin
  ON public.bookings
  FOR DELETE
  TO authenticated, anon
  USING (public.is_admin());

-- =====================================================================
-- Policies: webhook_events
-- =====================================================================
-- Webhook events are inserted by the server (service role, bypasses
-- RLS) when a PayRex webhook arrives. These policies prevent the
-- public from reading or tampering with the idempotency log.

-- SELECT — admin-only audit reads.
DROP POLICY IF EXISTS webhook_events_select_admin ON public.webhook_events;
CREATE POLICY webhook_events_select_admin
  ON public.webhook_events
  FOR SELECT
  TO authenticated, anon
  USING (public.is_admin());

-- INSERT — server inserts new event ids. Client inserts blocked.
DROP POLICY IF EXISTS webhook_events_insert_admin ON public.webhook_events;
CREATE POLICY webhook_events_insert_admin
  ON public.webhook_events
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.is_admin());

-- UPDATE — admin-only (rare; e.g. backfilling booking_id).
DROP POLICY IF EXISTS webhook_events_update_admin ON public.webhook_events;
CREATE POLICY webhook_events_update_admin
  ON public.webhook_events
  FOR UPDATE
  TO authenticated, anon
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE — admin-only.
DROP POLICY IF EXISTS webhook_events_delete_admin ON public.webhook_events;
CREATE POLICY webhook_events_delete_admin
  ON public.webhook_events
  FOR DELETE
  TO authenticated, anon
  USING (public.is_admin());

-- =====================================================================
-- Policies: app_config
-- =====================================================================
-- Protects the admin's user id from being enumerated by anonymous
-- callers. The initial row is inserted by an operator using the
-- service-role key (bypasses RLS), NOT by a client.

-- SELECT — admin-only. This also breaks the chicken-and-egg with
-- is_admin(): is_admin() is SECURITY DEFINER so it reads app_config
-- as the table owner, not via this policy.
DROP POLICY IF EXISTS app_config_select_admin ON public.app_config;
CREATE POLICY app_config_select_admin
  ON public.app_config
  FOR SELECT
  TO authenticated, anon
  USING (public.is_admin());

-- INSERT — only admin from a client. (Initial bootstrap is done with
-- the service-role key, which bypasses RLS.)
DROP POLICY IF EXISTS app_config_insert_admin ON public.app_config;
CREATE POLICY app_config_insert_admin
  ON public.app_config
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (public.is_admin());

-- UPDATE — admin can rotate her own user id if she re-creates her
-- Supabase Auth account.
DROP POLICY IF EXISTS app_config_update_admin ON public.app_config;
CREATE POLICY app_config_update_admin
  ON public.app_config
  FOR UPDATE
  TO authenticated, anon
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- DELETE — admin-only (rare; the row should normally always exist).
DROP POLICY IF EXISTS app_config_delete_admin ON public.app_config;
CREATE POLICY app_config_delete_admin
  ON public.app_config
  FOR DELETE
  TO authenticated, anon
  USING (public.is_admin());

-- =====================================================================
-- Final notes
-- =====================================================================
-- 1. The admin (JESS) Supabase Auth account is created in the Supabase
--    dashboard (or via the Auth admin API), NOT in this SQL.
-- 2. After JESS's account exists, an operator must run (using the
--    service-role key, which bypasses RLS):
--
--        insert into public.app_config (admin_user_id)
--        values ('<JESS-supabase-auth-user-uuid>');
--
--    Until that row exists, is_admin() returns false for everyone.
-- 3. The service-role key bypasses RLS entirely, so server-side writes
--    (booking creation, webhook handling, slot-lock sweeps) are NOT
--    affected by these policies.
