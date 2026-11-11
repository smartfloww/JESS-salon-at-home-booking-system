import { NextResponse } from 'next/server';
import {
  verifyWebhookSignature,
  retrieveCheckoutSession,
  type PayrexEvent,
  WebhookSignatureError,
} from '@/lib/payrex';
import { getConfig, isPayrexConfigured } from '@/lib/env';
import {
  recordWebhookEvent,
  markBookingPaid,
} from '@/lib/booking-server';
import { createServiceClient } from '@/lib/supabase/server';

/**
 * POST /api/webhooks/payrex
 *
 * PayRex webhook receiver. Verifies the signature, deduplicates by event
 * id, and — on a verified successful payment — marks the matching booking
 * as Paid.
 *
 * IMPORTANT: The success_url redirect is NOT proof of payment. This
 * webhook (or a server-side retrieve) is the only thing that can mark a
 * booking Paid.
 *
 * Idempotency & race handling:
 *   - Each PayRex event has a unique `id` (evt_...). We record it only
 *     after processing, so failed processing can be retried by PayRex.
 *   - markBookingPaid uses a conditional UPDATE (... WHERE status='pending')
 *     so a concurrent timeout-cleanup job cannot double-process.
 *
 * Signature: see src/lib/payrex.ts verifyWebhookSignature().
 */

// PayRex sends urlencoded-ish JSON as a raw body; we MUST read it raw to
// compute the signature. Next.js Route Handlers give us the body via
// request.text() — this preserves the exact bytes PayRex signed.

export async function POST(request: Request) {
  if (!isPayrexConfigured()) {
    return NextResponse.json({ error: 'PayRex not configured.' }, { status: 503 });
  }

  const config = getConfig();
  const signatureHeader = request.headers.get('Payrex-Signature');

  // Read the raw body exactly as received.
  const rawBody = await request.text();

  let event: PayrexEvent;
  try {
    event = verifyWebhookSignature(signatureHeader, rawBody, config.payrexWebhookSecretKey);
  } catch (e) {
    if (e instanceof WebhookSignatureError) {
      return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Signature error.' }, { status: 400 });
  }

  // We only act on payment success events.
  const isSuccess =
    event.type === 'payment_intent.succeeded' || event.type === 'payment.paid';

  if (!isSuccess) {
    // Acknowledge other events (no action). This stops PayRex retries.
    const isNew = await recordWebhookEvent(event.id, event.type, null, event);
    return NextResponse.json({
      received: true,
      duplicate: !isNew,
      type: event.type,
      action: 'ignored',
    });
  }

  const resource = event.data?.resource;
  if (!resource) {
    return NextResponse.json({ error: 'Payment event has no resource.' }, { status: 400 });
  }

  // Find the matching booking. PayRex stores our booking reference in
  // metadata (we set it at checkout creation) and/or customer_reference_id.
  // The resource may be a payment_intent or a payment; we resolve the
  // booking via the checkout_session_id → bookings.checkout_session_id.
  const supabase = createServiceClient();

  // Strategy: look up by checkout_session_id if present, else by
  // metadata.booking_reference / customer_reference_id.
  let bookingId: string | null = null;
  let checkoutSessionId: string | null =
    resource.checkout_session_id ??
    (typeof resource.metadata === 'object' && resource.metadata
      ? (resource.metadata as Record<string, unknown>).checkout_session_id as string | undefined ?? null
      : null);

  const metaRef =
    typeof resource.metadata === 'object' && resource.metadata
      ? ((resource.metadata as Record<string, unknown>).booking_reference as string | undefined) ??
        (resource.customer_reference_id as string | undefined)
      : resource.customer_reference_id;

  // Try lookup by checkout_session_id first.
  if (checkoutSessionId) {
    const { data } = await supabase
      .from('bookings')
      .select('id, reference')
      .eq('checkout_session_id', checkoutSessionId)
      .maybeSingle();
    if (data) bookingId = data.id;
  }

  // Fallback: lookup by reference (metadata / customer_reference_id).
  if (!bookingId && metaRef) {
    const { data } = await supabase
      .from('bookings')
      .select('id')
      .eq('reference', metaRef)
      .maybeSingle();
    if (data) {
      bookingId = data.id;
      // If we still don't have the checkout session id, fetch it.
      if (!checkoutSessionId) {
        const { data: full } = await supabase
          .from('bookings')
          .select('checkout_session_id')
          .eq('id', bookingId)
          .maybeSingle();
        checkoutSessionId = full?.checkout_session_id ?? null;
      }
    }
  }

  if (!bookingId) {
    // The booking may not have been persisted yet; allow PayRex to retry.
    return NextResponse.json({ error: 'No matching booking yet.' }, { status: 503 });
  }
  if (!checkoutSessionId) {
    return NextResponse.json({ error: 'Booking has no checkout session to verify.' }, { status: 503 });
  }

  // Double-verify the payment by retrieving the checkout session from PayRex.
  // This guards against a forged (but correctly-signed) webhook being used to
  // confirm a non-existent payment.
  let paymentReference: string | null = resource.id ?? null;
  try {
    const verification = await retrieveCheckoutSession(checkoutSessionId);
    if (!verification.paid) {
      // The event may arrive before the checkout session reflects payment.
      return NextResponse.json({
        error: 'PayRex has not confirmed payment yet.',
        status: verification.paymentIntentStatus,
      }, { status: 503 });
    }
    paymentReference = verification.paymentIntentId ?? paymentReference;
  } catch {
    // Do not acknowledge transient verification failures; PayRex can retry.
    return NextResponse.json(
      { received: true, action: 'verify_unavailable' },
      { status: 503 },
    );
  }

  // Mark the booking paid. Conditional on status='pending' so it's safe
  // against concurrent operations.
  await markBookingPaid(bookingId, paymentReference, 'webhook');

  const isNew = await recordWebhookEvent(event.id, event.type, bookingId, event);
  return NextResponse.json({
    received: true,
    duplicate: !isNew,
    action: 'paid',
  });
}

// PayRex may send a GET to verify the endpoint; respond 200.
export async function GET() {
  return NextResponse.json({ ok: true });
}
