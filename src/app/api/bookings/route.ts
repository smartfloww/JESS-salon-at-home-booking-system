import { NextResponse } from 'next/server';
import { createBooking } from '@/lib/booking-server';
import { createCheckoutSession } from '@/lib/payrex';
import { isPayrexConfigured, getConfig, isSupabaseConfigured } from '@/lib/env';
import { calculateDuration, calculatePricing, formatCurrency } from '@/lib/booking';
import type { BookingSelection } from '@/lib/booking';

/**
 * POST /api/bookings
 *
 * Creates a pending booking with a 10-minute slot lock, then creates a
 * PayRex Hosted Checkout session for the reservation fee and returns
 * the hosted checkout URL.
 *
 * The browser is redirected to PayRex. Payment is confirmed later via
 * the webhook (POST /api/webhooks/payrex), NOT via the redirect.
 *
 * All pricing/durations are recomputed server-side from the trusted catalogue.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Online booking is not available (database not configured). Please contact JESS directly.' },
      { status: 503 },
    );
  }
  if (!isPayrexConfigured()) {
    return NextResponse.json(
      { error: 'Online payment is not available (PayRex not configured). Please contact JESS directly.' },
      { status: 503 },
    );
  }

  let body: BookingSelection & {
    customerName: string;
    customerEmail: string;
    customerMobile: string;
    serviceAddress: string;
    appointmentDate: string;
    departureHour: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // Basic field presence checks.
  const required = [
    'customerName',
    'customerEmail',
    'customerMobile',
    'serviceAddress',
    'appointmentDate',
    'departureHour',
    'serviceAreaId',
  ] as const;
  for (const f of required) {
    if (!body[f] || String(body[f]).trim().length === 0) {
      return NextResponse.json({ error: `Missing field: ${f}.` }, { status: 400 });
    }
  }

  // Email format.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customerEmail)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 });
  }

  // Mobile: accept digits, spaces, +, -, (, ).
  const digits = body.customerMobile.replace(/[^\d]/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: 'Please enter a valid mobile number.' }, { status: 400 });
  }

  // Date validity (YYYY-MM-DD) and not in the past.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.appointmentDate)) {
    return NextResponse.json({ error: 'Invalid appointment date.' }, { status: 400 });
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appt = new Date(body.appointmentDate + 'T00:00:00');
  if (appt < today) {
    return NextResponse.json({ error: 'Appointment date cannot be in the past.' }, { status: 400 });
  }

  const departureHour = Number(body.departureHour);
  if (!Number.isInteger(departureHour) || departureHour < 8 || departureHour > 18) {
    return NextResponse.json({ error: 'Invalid departure time.' }, { status: 400 });
  }

  // Create the pending booking (server re-validates everything).
  const result = await createBooking({
    haircutQuantity: Number(body.haircutQuantity) || 0,
    haircutTypeNotes: body.haircutTypeNotes,
    majorSelections: Array.isArray(body.majorSelections) ? body.majorSelections : [],
    serviceAreaId: body.serviceAreaId,
    customerName: body.customerName,
    customerEmail: body.customerEmail,
    customerMobile: body.customerMobile,
    serviceAddress: body.serviceAddress,
    appointmentDate: body.appointmentDate,
    departureHour,
  });

  if (!result.ok || !result.booking) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  const booking = result.booking;

  // Recompute pricing for the checkout amount (already stored on the row,
  // but we recompute to be explicit that the browser never dictates amount).
  const selection: BookingSelection = {
    haircutQuantity: booking.haircut_quantity,
    majorSelections: booking.major_selections.map((m) => ({
      serviceId: m.serviceId,
      variantId: m.variantId,
    })),
    serviceAreaId: booking.service_area_id,
  };
  const pricing = calculatePricing(selection);
  const duration = calculateDuration(selection);
  const amountCentavos = pricing.reservationFee * 100; // ₱ → centavos

  // Build a human-readable description for the PayRex checkout.
  const items: string[] = [];
  if (booking.haircut_quantity > 0) {
    items.push(`${booking.haircut_quantity} haircut(s)`);
  }
  for (const m of booking.major_selections) {
    items.push(`${m.name} (${m.variantLabel})`);
  }
  const description = `JESS Salon at Home reservation — ${items.join(', ')}`;

  // Create the PayRex Hosted Checkout session.
  const config = getConfig();
  let checkout;
  try {
    checkout = await createCheckoutSession({
      amountCentavos,
      description,
      lineItems: [
        {
          name: 'Reservation fee',
          amount: amountCentavos,
          quantity: 1,
          description,
        },
      ],
      successUrl: `${config.nextPublicSiteUrl}/book/confirmation?ref=${encodeURIComponent(booking.reference)}&status=returned`,
      cancelUrl: `${config.nextPublicSiteUrl}/book/confirmation?ref=${encodeURIComponent(booking.reference)}&status=cancelled`,
      customerReferenceId: booking.reference,
      metadata: {
        booking_id: booking.id,
        booking_reference: booking.reference,
      },
    });
  } catch {
    // Checkout creation failed — cancel the just-created pending booking
    // so its slot is released.
    await cancelPendingOnCheckoutFailure(booking.id);
    return NextResponse.json(
      { error: 'We could not start payment. Please try again or contact JESS directly.' },
      { status: 502 },
    );
  }

  // Persist the checkout session id + URL on the booking.
  const { createServiceClient } = await import('@/lib/supabase/server');
  const supabase = createServiceClient();
  const { error: checkoutSaveError } = await supabase
    .from('bookings')
    .update({
      checkout_session_id: checkout.id,
      checkout_url: checkout.url,
    })
    .eq('id', booking.id);
  if (checkoutSaveError) {
    console.error('Could not save PayRex checkout session for booking:', checkoutSaveError);
    await cancelPendingOnCheckoutFailure(booking.id);
    return NextResponse.json(
      { error: 'We could not save your payment session. Please try again or contact JESS directly.' },
      { status: 502 },
    );
  }

  return NextResponse.json({
    bookingReference: booking.reference,
    checkoutUrl: checkout.url,
    reservationFee: pricing.reservationFee,
    reservationFeeLabel: formatCurrency(pricing.reservationFee),
    committedHours: duration.committedHours,
  });
}

async function cancelPendingOnCheckoutFailure(bookingId: string) {
  try {
    const { createServiceClient } = await import('@/lib/supabase/server');
    const supabase = createServiceClient();
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: 'payment_timeout',
        cancellation_note: 'Checkout session could not be created.',
        cancelled_at: new Date().toISOString(),
        lock_expires_at: null,
      })
      .eq('id', bookingId)
      .eq('status', 'pending');
  } catch {
    console.error('Could not release booking after PayRex checkout setup failed:', bookingId);
  }
}
