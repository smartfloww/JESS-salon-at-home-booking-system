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

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("payrex-signature") || req.headers.get("Payrex-Signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const attrs = payload?.data?.attributes ?? {};
  const type: string = payload?.data?.type ?? "";
  const reference: string | undefined =
    attrs.reference ?? attrs.metadata?.booking_reference;
  const checkoutSessionId: string | undefined =
    attrs.checkout_session_id ?? attrs.id;
  const amount: number | undefined = attrs.amount;

  if (!reference) {
    // Without a reference we can't reconcile the event.
    return NextResponse.json({ ok: true, ignored: true, reason: "no reference" });
  }

  const supabase = getSupabaseAdminClient();
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, reference, reservation_fee, payments(id, provider_ref, status)")
    .eq("reference", reference)
    .maybeSingle();
  if (bookingError) {
    console.error("Could not look up PayRex booking:", bookingError);
    return NextResponse.json({ error: "Booking lookup failed." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ ok: true, ignored: true, reason: "booking not found" });
  }

  // Only react to "successful" events. Failed/expired events leave the
  // booking in pending_payment; the timeout cleaner will release the slot.
  const isSuccess = /succeeded|paid|completed/i.test(type) || attrs.status === "paid";
  if (!isSuccess) {
    // Persist a note for failed events (informational only).
    return NextResponse.json({ ok: true, ignored: true, reason: `non-success event ${type}` });
  }

  // Find the matching payment row.
  let payment = booking.payments.find((p) => p.provider_ref === checkoutSessionId);
  if (!payment) payment = booking.payments[0];
  if (!payment) {
    return NextResponse.json({ ok: true, ignored: true, reason: "no payment row" });
  }

  // Idempotency: if already successful, do nothing.
  if (payment.status === "successful") {
    return NextResponse.json({ ok: true, idempotent: true });
  }

  // Amount verification (defensive): the paid amount must match the
  // reservation fee we asked for. We tolerate the case where PayRex doesn't
  // echo amount by skipping the check when it's missing.
  if (typeof amount === "number" && amount !== booking.reservation_fee) {
    console.warn(
      `Webhook amount mismatch for ${reference}: expected ${booking.reservation_fee}, got ${amount}`,
    );
    const { error } = await supabase.rpc("record_payment_success", {
      p_reference: reference,
      p_provider_ref: payment.provider_ref,
      p_amount: amount,
      p_raw_payload: rawBody.slice(0, 8000),
    });
    if (error) {
      console.error("Could not record PayRex amount mismatch:", error);
      return NextResponse.json({ error: "Payment could not be reconciled." }, { status: 500 });
    }
    return NextResponse.json({ ok: false, reason: "amount mismatch" }, { status: 200 });
  }

  const { data: result, error } = await supabase.rpc("record_payment_success", {
    p_reference: reference,
    p_provider_ref: payment.provider_ref,
    p_amount: amount ?? null,
    p_raw_payload: rawBody.slice(0, 8000),
  });
  if (error) {
    console.error("Could not record PayRex payment:", error);
    return NextResponse.json({ error: "Payment could not be reconciled." }, { status: 500 });
  }
  if (result === "amount_mismatch") {
    console.warn(`Webhook amount mismatch for ${reference}.`);
    return NextResponse.json({ ok: false, reason: "amount mismatch" }, { status: 200 });
  }
  if (result === "not_found") {
    return NextResponse.json({ ok: true, ignored: true, reason: "no payment row" });
  }
  if (result === "late_payment") {
    console.error(`PayRex reported a payment for cancelled booking ${reference}; manual review required.`);
    return NextResponse.json({ ok: true, manualReview: true });
  }

  return NextResponse.json({ ok: true, idempotent: result === "idempotent" });
}
