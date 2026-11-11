import { NextResponse } from 'next/server';
import { getAdminUser } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * GET /api/admin/session
 *
 * Returns whether an admin session is active. Used by the login page
 * to redirect to the dashboard when already signed in.
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, authenticated: false });
  }
  const user = await getAdminUser();
  return NextResponse.json({ configured: true, authenticated: Boolean(user) });
}
