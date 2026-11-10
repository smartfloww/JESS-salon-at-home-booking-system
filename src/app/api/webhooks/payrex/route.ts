/**
 * POST /api/webhooks/payrex
 *
 * PayRex webhook receiver. Verifies the HMAC-SHA256 signature using the
 * PAYREX_WEBHOOK_SECRET, then updates the booking payment status.
 *
 * Expected PayRex event payloads (current API):
 *   {
 *     "data": {
 *       "id": "evt_…",
 *       "type": "payment.succeeded" | "checkout_session.paid" | …,
 *       "attributes": {
 *         "reference": "JESS-XXXXX",
 *         "amount": 50000,            // centavos
 *         "currency": "PHP",
 *         "status": "paid",
 *         "checkout_session_id": "chksess_…"
 *       }
 *     }
 *   }
 *
 * The handler is IDEMPOTENT: duplicate events are no-ops because we look up
 * the payment by `providerRef` and only transition `pending` → `successful`.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { verifyWebhookSignature } from "@/lib/payrex";
import { matchesPayRexSuccessEvent, parsePayRexSuccessEvent } from "@/lib/payrex-webhook";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("payrex-signature") || req.headers.get("Payrex-Signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const event = parsePayRexSuccessEvent(payload);
  if (!event) {
    return NextResponse.json({ error: "Incomplete or invalid payment event." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, reference, reservation_fee, payments(id, provider_ref, amount, status)")
    .eq("reference", event.reference)
    .maybeSingle();
  if (bookingError) {
    console.error("Could not look up PayRex booking:", bookingError);
    return NextResponse.json({ error: "Booking lookup failed." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking or checkout session not found." }, { status: 404 });
  }

  const payment = booking.payments.find(
    (candidate) => candidate.provider_ref === event.checkoutSessionId,
  );
  if (!payment) {
    return NextResponse.json({ error: "Booking or checkout session not found." }, { status: 404 });
  }

  if (!matchesPayRexSuccessEvent(
    event,
    { reference: booking.reference, reservationFee: booking.reservation_fee },
    { providerRef: payment.provider_ref, amount: payment.amount },
  )) {
    return NextResponse.json(
      { error: "Payment details do not match the booking." },
      { status: 400 },
    );
  }

  if (payment.status === "successful") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  const { data: result, error } = await supabase.rpc("record_payment_success", {
    p_reference: event.reference,
    p_provider_ref: payment.provider_ref,
    p_amount: event.amount,
    p_raw_payload: rawBody.slice(0, 8000),
  });
  if (error) {
    console.error("Could not record PayRex payment:", error);
    return NextResponse.json({ error: "Payment could not be reconciled." }, { status: 500 });
  }
  if (result === "amount_mismatch") {
    return NextResponse.json(
      { error: "Payment amount does not match the booking." },
      { status: 400 },
    );
  }
  if (result === "not_found") {
    return NextResponse.json({ error: "Booking or checkout session not found." }, { status: 404 });
  }
  if (result === "late_payment_refund_required") {
    console.error(
      `PayRex confirmed a late payment for ${event.reference}; manual refund/reconciliation is required.`,
    );
    return NextResponse.json({ ok: true, manualReview: true });
  }

  return NextResponse.json({
    ok: true,
    idempotent: result === "idempotent",
    reinstated: result === "late_payment_reinstated",
  });
}
