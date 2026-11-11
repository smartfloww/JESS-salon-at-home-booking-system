import { NextResponse } from 'next/server';
import { releaseExpiredPendingLocks } from '@/lib/booking-server';
import { retrieveCheckoutSession } from '@/lib/payrex';
import { isPayrexConfigured, isSupabaseConfigured } from '@/lib/env';

/**
 * POST /api/bookings/cleanup
 *
 * Releases expired pending slot locks (10-minute hold passed without
 * payment). For each expired pending booking, verifies the payment
 * status with PayRex first — if it actually paid, marks it paid instead
 * of cancelling (protects against a late webhook).
 *
 * This endpoint is intended to be called by a CRON JOB in production
 * (e.g. every minute) so cleanup runs reliably without depending on
 * someone opening the availability page.
 *
 * It is also safe to call from the availability check as a fallback.
 *
 * Auth: protected by a shared secret (CLEANUP_API_KEY) to prevent abuse.
 * If CLEANUP_API_KEY is not set, the endpoint refuses to run.
 */
export async function POST(request: Request) {
  const expectedKey = process.env.CLEANUP_API_KEY;
  if (!expectedKey) {
    return NextResponse.json(
      { error: 'Cleanup endpoint not configured (CLEANUP_API_KEY missing).' },
      { status: 503 },
    );
  }
  const auth = request.headers.get('authorization');
  const provided = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (provided !== expectedKey) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ cancelled: 0, paid: 0, skipped: 'no-db' });
  }

  // Verifier: retrieve the checkout session from PayRex.
  const verifyPayment = async (checkoutSessionId: string) => {
    if (!isPayrexConfigured()) return { paid: false };
    const v = await retrieveCheckoutSession(checkoutSessionId);
    return { paid: v.paid };
  };

  try {
    const result = await releaseExpiredPendingLocks(verifyPayment);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cleanup failed.' },
      { status: 500 },
    );
  }
}
