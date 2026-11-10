/**
 * GET /api/bookings/by-session?session=mock-…
 *
 * Looks up a booking by its PayRex checkout session id (stored on the Payment
 * row as `providerRef`). Used by the mock-checkout page to discover which
 * booking a given mock checkout session belongs to.
 *
 * Returns `{ reference, status }` or 404.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get("session");

  if (!session) {
    return NextResponse.json(
      { error: "Missing session parameter." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdminClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("booking_id")
    .eq("provider_ref", session)
    .maybeSingle();
  if (error) {
    console.error("Could not look up checkout session:", error);
    return NextResponse.json({ error: "Checkout session lookup failed." }, { status: 500 });
  }

  if (!payment) {
    return NextResponse.json(
      { error: "No booking found for this checkout session." },
      { status: 404 },
    );
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("reference, status")
    .eq("id", payment.booking_id)
    .maybeSingle();
  if (bookingError) {
    console.error("Could not load checkout booking:", bookingError);
    return NextResponse.json({ error: "Checkout session lookup failed." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json(
      { error: "No booking found for this checkout session." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    reference: booking.reference,
    status: booking.status,
  });
}
