/**
 * GET /api/admin/bookings?status=pending_payment|paid|completed|cancelled
 *
 * Returns the bookings list for the admin dashboard. Requires admin session.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { formatPHP } from "@/lib/pricing";
import { formatTime, formatDuration } from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const requestedStatus = searchParams.get("status") || "paid";
  const allowedStatuses = ["pending_payment", "paid", "completed", "cancelled"];
  const status =
    requestedStatus === "all"
      ? "all"
      : allowedStatuses.includes(requestedStatus)
        ? requestedStatus
        : "paid";

  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .select(
      "id, reference, status, cancellation_reason, appointment_date, departure_time, reserved_minutes, service_minutes, total_service_price, reservation_fee, remaining_balance, created_at, payment_deadline, customer_id, area_id",
    );
  if (status !== "all") query = query.eq("status", status);

  const { data: bookings, error } = await query
    .order("appointment_date", { ascending: true })
    .order("departure_time", { ascending: true });
  if (error) {
    console.error("Could not load admin bookings:", error);
    return NextResponse.json({ error: "Bookings could not be loaded." }, { status: 500 });
  }
  if (!bookings?.length) return NextResponse.json({ bookings: [] });

  const bookingIds = bookings.map((booking) => booking.id);
  const customerIds = [...new Set(bookings.map((booking) => booking.customer_id))];
  const areaIds = [...new Set(bookings.map((booking) => booking.area_id))];
  const [customersResult, areasResult, itemsResult, paymentsResult] = await Promise.all([
    supabase
      .from("customers")
      .select("id, full_name, phone, email, address, barangay, city, province, landmark")
      .in("id", customerIds),
    supabase
      .from("service_areas")
      .select("id, name, travel_minutes")
      .in("id", areaIds),
    supabase
      .from("booking_items")
      .select("booking_id, service_name, variant_name, quantity, unit_price, unit_duration, unit_category")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("payments")
      .select("booking_id, status, provider_ref, created_at")
      .in("booking_id", bookingIds)
      .order("created_at", { ascending: false }),
  ]);
  const relatedErrors = [
    customersResult.error,
    areasResult.error,
    itemsResult.error,
    paymentsResult.error,
  ].filter(Boolean);
  if (relatedErrors.length > 0) {
    console.error("Could not load admin booking details:", relatedErrors);
    return NextResponse.json({ error: "Bookings could not be loaded." }, { status: 500 });
  }

  const customers = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer]));
  const areas = new Map((areasResult.data ?? []).map((area) => [area.id, area]));
  const itemsByBooking = new Map<string, NonNullable<typeof itemsResult.data>>();
  for (const item of itemsResult.data ?? []) {
    const items = itemsByBooking.get(item.booking_id) ?? [];
    items.push(item);
    itemsByBooking.set(item.booking_id, items);
  }
  const latestPaymentByBooking = new Map<
    string,
    NonNullable<typeof paymentsResult.data>[number]
  >();
  for (const payment of paymentsResult.data ?? []) {
    if (!latestPaymentByBooking.has(payment.booking_id)) {
      latestPaymentByBooking.set(payment.booking_id, payment);
    }
  }

  const result: Record<string, unknown>[] = [];
  for (const booking of bookings) {
    const customer = customers.get(booking.customer_id);
    const area = areas.get(booking.area_id);
    if (!customer || !area) {
      console.error("Admin booking is missing related customer/area:", booking.id);
      return NextResponse.json({ error: "Bookings could not be loaded." }, { status: 500 });
    }

    const payment = latestPaymentByBooking.get(booking.id);
    result.push({
      id: booking.id,
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
      createdAt: booking.created_at,
      paymentDeadline: booking.payment_deadline,
      paymentStatus: payment?.status ?? "pending",
      paymentProviderRef: payment?.provider_ref ?? null,
      customer: {
        fullName: customer.full_name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        barangay: customer.barangay,
        city: customer.city,
        province: customer.province,
        landmark: customer.landmark,
      },
      items: (itemsByBooking.get(booking.id) ?? []).map((item) => ({
        serviceName: item.service_name,
        variantName: item.variant_name,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        unitPriceLabel: formatPHP(item.unit_price),
        linePrice: item.unit_price * item.quantity,
        linePriceLabel: formatPHP(item.unit_price * item.quantity),
        unitDuration: item.unit_duration,
        lineDuration: item.unit_duration * item.quantity,
        lineDurationLabel: formatDuration(item.unit_duration * item.quantity),
        unitCategory: item.unit_category,
      })),
    });
  }

  return NextResponse.json({ bookings: result });
}
