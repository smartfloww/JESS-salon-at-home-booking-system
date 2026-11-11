import { NextResponse } from 'next/server';
import {
  getBookingByReference,
  markBookingPaid,
} from '@/lib/booking-server';
import { isPayrexConfigured } from '@/lib/env';
import { retrieveCheckoutSession } from '@/lib/payrex';

/**
 * GET /api/bookings/[id]?ref=REFERENCE
 *
 * Public endpoint used by the confirmation page to show the current
 * booking status (pending → paid). Returns only the fields safe to
 * show to the customer — no other customer's data, no admin-only fields.
 *
 * The booking is looked up by reference (passed as ?ref=). The [id] path
 * segment is accepted but the reference is the authoritative lookup key.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  // Accept either a reference passed as the path segment or ?ref=.
  const reference = id;

  if (!reference) {
    return NextResponse.json({ error: 'Missing booking reference.' }, { status: 400 });
  }

  const foundBooking = await getBookingByReference(reference);
  if (!foundBooking) {
    return NextResponse.json({ error: 'Booking not found.' }, { status: 404 });
  }
  let booking = foundBooking;

  let paymentCheck: 'not_needed' | 'pending' | 'unavailable' = 'not_needed';
  if (booking.status === 'pending') {
    paymentCheck = 'pending';
    if (booking.checkout_session_id && isPayrexConfigured()) {
      try {
        const verification = await retrieveCheckoutSession(booking.checkout_session_id);
        if (verification.paid) {
          await markBookingPaid(booking.id, verification.paymentIntentId, 'confirmation-check');
          const refreshedBooking = await getBookingByReference(reference);
          if (!refreshedBooking) {
            throw new Error('Booking disappeared after payment verification.');
          }
          booking = refreshedBooking;
          paymentCheck = 'not_needed';
        }
      } catch (error) {
        console.error('Could not verify PayRex payment from booking confirmation:', error);
        paymentCheck = 'unavailable';
      }
    } else if (!booking.checkout_session_id || !isPayrexConfigured()) {
      paymentCheck = 'unavailable';
    }
  }

  // Only expose customer-safe fields.
  return NextResponse.json({
    reference: booking.reference,
    status: booking.status,
    paymentCheck,
    appointmentDate: booking.appointment_date,
    departureHour: booking.departure_hour,
    committedHours: booking.committed_hours,
    travelHours: booking.travel_hours,
    serviceHours: booking.service_hours,
    serviceAreaLabel: booking.service_area_label,
    totalPrice: booking.total_price,
    reservationFee: booking.reservation_fee,
    remainingBalance: booking.remaining_balance,
    haircutQuantity: booking.haircut_quantity,
    majorSelections: booking.major_selections,
    cancellationReason: booking.cancellation_reason,
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerMobile: booking.customer_mobile,
    createdAt: booking.created_at,
  });
}
