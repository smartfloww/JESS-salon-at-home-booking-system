/**
 * POST /api/bookings/create
 *
 * Body:
 *   {
 *     areaId: string,
 *     items: [{ serviceSlug, variantName?, quantity }],
 *     customer: { fullName, phone, email?, address, barangay, city, province, landmark? },
 *     appointmentDate: "YYYY-MM-DD",
 *     departureTime: number,        // minutes from midnight
 *     acceptedPolicy: boolean
 *   }
 *
 * Steps:
 *   1. Validate input shape.
 *   2. Price the selection server-side (never trust the client).
 *   3. Validate the booking combination.
 *   4. Re-check availability for the requested slot (defends against races).
 *   5. Inside a transaction:
 *        - release expired pending bookings
 *        - create Customer + Booking + BookingItems (status = pending_payment)
 *        - set paymentDeadline = now + 10 minutes
 *        - create a PayRex Checkout Session (or mock equivalent)
 *        - create a Payment row with providerRef = sessionId, status = pending
 *   6. Return the booking reference + checkout URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import {
  priceSelection,
  SelectedLineInput,
  generateBookingReference,
  ServicePricingUnavailableError,
} from "@/lib/pricing";
import { validateCombo, countCombo } from "@/lib/booking-rules";
import {
  computeReservedMinutes,
  getAvailableDepartureTimes,
  releaseExpiredPendingBookings,
  manilaToday,
  DEPARTURE_STEP_MIN,
  WORK_START_MIN,
  WORK_END_MIN,
} from "@/lib/scheduling";
import { createCheckoutSession, isMockMode } from "@/lib/payrex";

const PAYMENT_DEADLINE_MINUTES = 10;

interface CreateBody {
  areaId: string;
  items: SelectedLineInput[];
  customer: {
    fullName: string;
    phone: string;
    email?: string;
    address: string;
    barangay: string;
    city: string;
    province: string;
    landmark?: string;
  };
  appointmentDate: string;
  departureTime: number;
  acceptedPolicy: boolean;
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function POST(req: NextRequest) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return fail(400, "Invalid JSON body.");
  }
  if (!body || typeof body !== "object") return fail(400, "Invalid request body.");

  // ---- basic shape validation ----
  if (!body.areaId || typeof body.areaId !== "string") return fail(400, "Missing areaId.");
  if (!Array.isArray(body.items) || body.items.length === 0) return fail(400, "No services selected.");
  if (
    body.items.some(
      (item) =>
        !item ||
        typeof item.serviceSlug !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0,
    )
  ) {
    return fail(400, "Each selected service must have a valid quantity.");
  }
  if (!body.customer?.fullName?.trim()) return fail(400, "Full name is required.");
  if (!body.customer?.phone?.trim()) return fail(400, "Contact number is required.");
  if (!body.customer?.address?.trim()) return fail(400, "Address is required.");
  if (!body.customer?.barangay?.trim()) return fail(400, "Barangay is required.");
  if (!body.customer?.city?.trim()) return fail(400, "City is required.");
  if (!body.customer?.province?.trim()) return fail(400, "Province is required.");
  if (body.acceptedPolicy !== true) return fail(400, "You must accept the reservation policy.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.appointmentDate || "")) return fail(400, "Invalid date.");
  const parsedDate = new Date(`${body.appointmentDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== body.appointmentDate
  ) {
    return fail(400, "Invalid date.");
  }

  const today = manilaToday();
  if (body.appointmentDate < today) return fail(400, "Appointment date is in the past.");

  if (
    !Number.isInteger(body.departureTime) ||
    body.departureTime < WORK_START_MIN ||
    body.departureTime >= WORK_END_MIN ||
    (body.departureTime - WORK_START_MIN) % DEPARTURE_STEP_MIN !== 0
  ) {
    return fail(400, "Invalid departure time.");
  }

  // ---- fetch area ----
  const { data: area, error: areaError } = await getSupabaseAdminClient()
    .from("service_areas")
    .select("id, travel_minutes")
    .eq("id", body.areaId)
    .maybeSingle();
  if (areaError) {
    console.error("Could not load service area:", areaError);
    return fail(500, "Service area could not be loaded.");
  }
  if (!area) return fail(400, "Unknown service area.");

  // ---- price the selection (server-authoritative) ----
  let breakdown;
  try {
    breakdown = await priceSelection(body.items);
  } catch (e) {
    if (e instanceof ServicePricingUnavailableError) {
      return fail(500, "Service pricing is temporarily unavailable.");
    }
    return fail(400, e instanceof Error ? e.message : "Invalid service selection.");
  }

  // ---- validate combination ----
  const combo = countCombo(
    breakdown.lines.map((l) => ({ unitCategory: l.unitCategory, quantity: l.quantity })),
  );
  const comboCheck = validateCombo(combo);
  if (!comboCheck.ok) return fail(400, comboCheck.reason || "Invalid service combination.");

  // ---- scheduling ----
  const reservedMinutes = computeReservedMinutes(
    breakdown.totalServiceMinutes,
    area.travel_minutes,
  );

  if (reservedMinutes > WORK_END_MIN - WORK_START_MIN) {
    return fail(400, "Selected services + travel exceed the daily working window.");
  }

  // Release expired bookings BEFORE checking availability.
  await releaseExpiredPendingBookings();

  // Re-check availability (defends against races). We do this inside a
  // transaction below too, but a pre-check gives nicer errors.
  const available = await getAvailableDepartureTimes(body.appointmentDate, reservedMinutes);
  if (!available.includes(body.departureTime)) {
    return fail(409, "Sorry, this departure time is no longer available. Please pick another.");
  }

  // ---- create the booking inside a transaction ----
  const reference = generateBookingReference();
  const now = new Date();
  const paymentDeadline = new Date(now.getTime() + PAYMENT_DEADLINE_MINUTES * 60_000);
  const supabase = getSupabaseAdminClient();

  const successUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/book/result?ref=${reference}&status=success`;
  const cancelUrl = `${process.env.NEXT_PUBLIC_BASE_URL || ""}/book/result?ref=${reference}&status=cancel`;

  let checkout;
  try {
    checkout = await createCheckoutSession({
      amount: breakdown.reservationFee,
      currency: "PHP",
      reference,
      description: `JESS Salon at Home reservation ${reference} — ${breakdown.haircutCount} haircut(s) + ${breakdown.majorCount} major service(s)`,
      successUrl,
      cancelUrl,
    });
  } catch (e) {
    console.error("PayRex checkout creation failed:", e);
    return fail(502, "Payment provider unavailable. Please try again later.");
  }

  try {
    const { data: booking, error } = await supabase.rpc("create_booking", {
      p_customer: {
        full_name: body.customer.fullName.trim(),
        phone: body.customer.phone.trim(),
        email: body.customer.email?.trim() || null,
        address: body.customer.address.trim(),
        barangay: body.customer.barangay.trim(),
        city: body.customer.city.trim(),
        province: body.customer.province.trim(),
        landmark: body.customer.landmark?.trim() || null,
      },
      p_booking: {
        reference,
        area_id: area.id,
        appointment_date: body.appointmentDate,
        departure_time: body.departureTime,
        reserved_minutes: reservedMinutes,
        service_minutes: breakdown.totalServiceMinutes,
        total_service_price: breakdown.totalServicePrice,
        reservation_fee: breakdown.reservationFee,
        remaining_balance: breakdown.remainingBalance,
        payment_deadline: paymentDeadline.toISOString(),
      },
      p_items: breakdown.lines.map((line) => ({
        service_id: line.serviceId,
        service_name: line.serviceName,
        variant_name: line.variantName,
        unit_price: line.unitPrice,
        unit_duration: line.unitDuration,
        quantity: line.quantity,
        unit_category: line.unitCategory,
      })),
      p_payment: {
        provider_ref: checkout.sessionId,
        amount: breakdown.reservationFee,
      },
    });
    if (error) {
      if (error.code === "23P01") {
        return fail(409, "Sorry, this departure time was just taken. Please pick another.");
      }
      console.error("Booking creation failed:", error);
      return fail(500, "Booking could not be created. Please try again.");
    }
    if (!booking) {
      console.error("Booking creation returned no booking record.");
      return fail(500, "Booking could not be created. Please try again.");
    }

    return NextResponse.json({
      reference: booking.reference,
      bookingId: booking.id,
      checkoutUrl: checkout.checkoutUrl,
      sessionId: checkout.sessionId,
      mock: isMockMode(),
      reservationFee: breakdown.reservationFee,
      paymentDeadline: paymentDeadline.toISOString(),
    });
  } catch (error) {
    console.error("Booking creation failed:", error);
    return fail(500, "Booking could not be created. Please try again.");
  }
}
