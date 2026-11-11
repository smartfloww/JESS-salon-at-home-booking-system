import { NextResponse } from 'next/server';
import { completeBooking, cancelBooking } from '@/lib/booking-server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * PATCH /api/admin/bookings/[id]
 *
 * Body: { action: "complete" | "cancel", note?: string }
 *
 * Requires an authenticated admin session (enforced inside the
 * booking-server functions).
 *
 *  - complete: marks a Paid booking as Completed (does NOT release the block).
 *  - cancel:   cancels a Paid/Pending booking as admin_cancellation (releases slot).
 *
 * JESS cannot manually mark an unpaid booking as Paid — there is no
 * "pay" action here.
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const { id } = await context.params;

  let body: { action?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const action = body.action;
  if (action !== 'complete' && action !== 'cancel') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
  }

  try {
    if (action === 'complete') {
      const booking = await completeBooking(id, body.note);
      return NextResponse.json({ booking });
    } else {
      const booking = await cancelBooking(id, body.note);
      return NextResponse.json({ booking });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Operation failed.';
    const status = msg.toLowerCase().includes('unauthorized') ? 401 : 422;
    return NextResponse.json({ error: msg }, { status });
  }
}
