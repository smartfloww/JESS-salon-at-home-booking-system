/**
 * POST /api/bookings/mock-succeed
 *
 * MOCK MODE ONLY. Simulates a successful PayRex payment for a booking
 * created in mock mode. Real PayRex success comes through the webhook
 * endpoint with a verified signature; this endpoint exists so the booking
 * flow can be exercised end-to-end without PayRex credentials.
 *
 * Body: { reference: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { isMockMode } from "@/lib/payrex";

export async function POST(req: NextRequest) {
  if (!isMockMode()) {
    return NextResponse.json({ error: "Mock mode is disabled." }, { status: 403 });
  }

  let body: { reference?: string };
  try {
    body = (await req.json()) as { reference?: string };
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!body.reference) {
    return NextResponse.json({ error: "Missing reference." }, { status: 400 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select("id, reference, status, payments(id, provider_ref, amount, status)")
    .eq("reference", body.reference)
    .maybeSingle();
  if (error) {
    console.error("Could not load mock booking:", error);
    return NextResponse.json({ error: "Booking could not be loaded." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ ok: true, status: booking.status, already: true });
  }

  const payment = booking.payments[0];
  if (!payment) {
    console.error("Mock booking has no payment record:", booking.reference);
    return NextResponse.json({ error: "Payment record not found." }, { status: 500 });
  }
  const rawPayload = JSON.stringify({ mock: true, at: new Date().toISOString() });
  const { data: result, error: paymentError } = await supabase.rpc(
    "record_payment_success",
    {
      p_reference: booking.reference,
      p_provider_ref: payment.provider_ref,
      p_amount: payment.amount,
      p_raw_payload: rawPayload,
    },
  );
  if (paymentError) {
    console.error("Could not record mock payment:", paymentError);
    return NextResponse.json({ error: "Mock payment could not be recorded." }, { status: 500 });
  }
  if (result === "not_found") {
    return NextResponse.json({ error: "Payment record not found." }, { status: 404 });
  }
  if (result === "late_payment") {
    return NextResponse.json({ error: "Booking is no longer awaiting payment." }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: "paid" });
}
