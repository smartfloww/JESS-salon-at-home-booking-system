import { NextResponse } from 'next/server';
import { listBookings } from '@/lib/booking-server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * GET /api/admin/bookings?status=paid
 *
 * Returns bookings for the admin dashboard. Requires an authenticated
 * admin session (enforced inside listBookings).
 *
 * Allowed status values: pending | paid | completed.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured.', bookings: [] },
      { status: 503 },
    );
  }
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') ?? 'paid';
  if (!['pending', 'paid', 'completed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  try {
    const bookings = await listBookings(status);
    return NextResponse.json({ bookings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unauthorized.' },
      { status: 401 },
    );
  }
}
