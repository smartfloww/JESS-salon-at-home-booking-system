/**
 * Supabase clients.
 *
 * - `createServiceClient()`: uses the service-role key. Bypasses RLS.
 *   SERVER ONLY. Used for all privileged writes (creating bookings,
 *   recording webhooks, admin operations, slot-lock cleanup).
 *
 * - `createBrowserClient()`: uses the anon key + RLS. Safe for the browser.
 *   Used for admin auth (sign in / sign out / session) via Supabase Auth.
 *
 * - `createAuthClient()`: server-side client using the anon key, used to
 *   read the current admin session from cookies. RLS still applies, but
 *   an authenticated admin session is granted access by the `is_admin()`
 *   SQL policy.
 */

import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ConfigError, isSupabaseConfigured } from '@/lib/env';

// We use @supabase/supabase-js for the service client and @supabase/ssr
// for cookie-based auth handling.
import type { SupabaseClient } from '@supabase/supabase-js';

function getPublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new ConfigError(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (and the server-only SUPABASE_SERVICE_ROLE_KEY) in your environment. See .env.example.',
    );
  }
  return { url, anon };
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new ConfigError(
      'SUPABASE_SERVICE_ROLE_KEY is not configured. This server-only secret is required to create bookings and process payments. See .env.example.',
    );
  }
  return key;
}

/** Service-role client (bypasses RLS). SERVER ONLY — never import in a client component. */
export function createServiceClient(): SupabaseClient {
  const { url } = getPublicConfig();
  const serviceKey = getServiceKey();
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Server-side auth client bound to the request cookies. Reads the current
 * admin session (if any). RLS applies, but the `is_admin()` policy grants
 * the authenticated admin access.
 */
export async function createAuthClient(): Promise<SupabaseClient> {
  const { url, anon } = getPublicConfig();
  const cookieStore = await cookies();
  return createSupabaseServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component where cookies can't be set.
          // Safe to ignore — middleware will handle refresh.
        }
      },
    },
  });
}

/** Returns the authenticated admin user, or null if not signed in. */
export async function getAdminUser() {
  if (!isSupabaseConfigured()) return null;
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}
