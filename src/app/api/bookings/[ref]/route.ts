/**
 * GET /api/bookings/[ref]
 * Returns the public-facing detail of a single booking (customer view).
 * Sensitive fields (admin-only) are stripped.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { formatPHP } from "@/lib/pricing";
import { formatTime, formatDuration } from "@/lib/scheduling";
import {
  isValidBookingAccessToken,
  parseBookingAccessAuthorization,
} from "@/lib/booking-access";

export async function GET(req: NextRequest, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const accessToken = parseBookingAccessAuthorization(req.headers.get("authorization"));
  if (!accessToken) {
    return NextResponse.json({ error: "Booking access token required." }, { status: 401 });
  }

  const supabase = getSupabaseAdminClient();
  const { data: booking, error } = await supabase
    .from("bookings")
    .select(
      "id, reference, booking_access_token_hash, status, cancellation_reason, appointment_date, departure_time, reserved_minutes, service_minutes, total_service_price, reservation_fee, remaining_balance, area_id",
    )
    .eq("reference", ref)
    .maybeSingle();
  if (error) {
    console.error("Could not load booking details:", error);
    return NextResponse.json({ error: "Booking details are unavailable." }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }
  if (!isValidBookingAccessToken(accessToken, booking.booking_access_token_hash)) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const [areaResult, itemsResult, paymentsResult] = await Promise.all([
    supabase
      .from("service_areas")
      .select("name, travel_minutes")
      .eq("id", booking.area_id)
      .maybeSingle(),
    supabase
      .from("booking_items")
      .select("service_name, variant_name, quantity, unit_price, unit_duration, unit_category")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("status, created_at")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: false }),
  ]);
  const relatedErrors = [areaResult.error, itemsResult.error, paymentsResult.error].filter(Boolean);
  if (relatedErrors.length > 0) {
    console.error("Could not load related booking details:", relatedErrors);
    return NextResponse.json({ error: "Booking details are unavailable." }, { status: 500 });
  }
  const area = areaResult.data;
  if (!area) {
    console.error("Booking is missing its service area:", booking.reference);
    return NextResponse.json({ error: "Booking details are unavailable." }, { status: 500 });
  }

  const payments = [...(paymentsResult.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return NextResponse.json({
    reference: booking.reference,
    status: booking.status,
    cancellationReason: booking.cancellation_reason,
    appointmentDate: booking.appointment_date,
    departureTime: booking.departure_time,
    departureLabel: formatTime(booking.departure_time),
    arrivalLabel: formatTime(booking.departure_time + area.travel_minutes),
    completionLabel: formatTime(booking.departure_time + booking.reserved_minutes),
    reservedMinutes: booking.reserved_minutes,
    reservedLabel: formatDuration(booking.reserved_minutes),
    serviceMinutes: booking.service_minutes,
    serviceLabel: formatDuration(booking.service_minutes),
    travelMinutes: area.travel_minutes,
    travelLabel: formatDuration(area.travel_minutes),
    area: area.name,
    totalServicePrice: booking.total_service_price,
    totalServicePriceLabel: formatPHP(booking.total_service_price),
    reservationFee: booking.reservation_fee,
    reservationFeeLabel: formatPHP(booking.reservation_fee),
    remainingBalance: booking.remaining_balance,
    remainingBalanceLabel: formatPHP(booking.remaining_balance),
    items: (itemsResult.data ?? []).map((it) => ({
      serviceName: it.service_name,
      variantName: it.variant_name,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      unitPriceLabel: formatPHP(it.unit_price),
      linePrice: it.unit_price * it.quantity,
      linePriceLabel: formatPHP(it.unit_price * it.quantity),
      unitDuration: it.unit_duration,
      lineDuration: it.unit_duration * it.quantity,
      lineDurationLabel: formatDuration(it.unit_duration * it.quantity),
      unitCategory: it.unit_category,
    })),
    paymentStatus: payments[0]?.status ?? "pending",
  });
}
