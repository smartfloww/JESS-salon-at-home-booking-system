/**
 * Browser-side Supabase client.
 *
 * Uses the anon key only. Used exclusively for admin authentication
 * (sign in / sign out / session refresh) inside the admin dashboard.
 *
 * All booking data access is gated by RLS: the `is_admin()` policy grants
 * the authenticated admin read/write; everyone else gets nothing.
 *
 * This client must NEVER hold the service-role key.
 */

import { createBrowserClient } from '@supabase/ssr';

export function createBrowserClientSafe() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY. See .env.example.',
    );
  }
  return createBrowserClient(url, anon);
}
