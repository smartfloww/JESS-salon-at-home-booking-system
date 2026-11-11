'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDateLong, formatTime } from '@/lib/booking';
import { SERVICE_AREAS, findMajorService, findVariant } from '@/lib/catalogue';
import '@/components/booking/booking.css';

interface BookingStatus {
  reference: string;
  status: string;
  appointmentDate: string;
  departureHour: number;
  committedHours: number;
  travelHours: number;
  serviceHours: number;
  serviceAreaLabel: string;
  totalPrice: number;
  reservationFee: number;
  remainingBalance: number;
  haircutQuantity: number;
  majorSelections: { serviceId: string; variantId: string; name: string; variantLabel: string; price: number; durationHours: number }[];
  cancellationReason: string | null;
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  createdAt: string;
  paymentCheck: 'not_needed' | 'pending' | 'unavailable';
}

function ConfirmationContent() {
  const params = useSearchParams();
  const ref = params.get('ref');
  const status = params.get('status');
  const [booking, setBooking] = useState<BookingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ref) {
      setError('No booking reference provided.');
      setLoading(false);
      return;
    }
    let cancelled = false;
    let attempts = 0;
    const poll = async () => {
      attempts++;
      try {
        const r = await fetch(`/api/bookings/${encodeURIComponent(ref)}`);
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setError(data.error || 'Booking not found.');
          setLoading(false);
          return;
        }
        setBooking(data);
        setLoading(false);
        // If still pending, keep polling for a bit (webhook may arrive shortly).
        if (data.status === 'pending' && attempts < 12) {
          setTimeout(poll, 5000);
        }
      } catch {
        if (cancelled) return;
        setError('Network error. Please refresh.');
        setLoading(false);
      }
    };
    poll();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (loading) {
    return (
      <div className="booking-result">
        <p className="eyebrow" style={{ color: '#9e7831' }}>VERIFYING YOUR PAYMENT</p>
        <h1 style={{ font: '500 34px "Playfair Display",serif', margin: '10px 0' }}>
          Confirming your booking…
        </h1>
        <p style={{ color: '#7c6f60', fontSize: 13 }}>
          Please wait while we confirm your payment with PayRex. This usually takes a few seconds.
        </p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="booking-result">
        <p className="eyebrow" style={{ color: '#9e7831' }}>BOOKING STATUS</p>
        <h1 style={{ font: '500 30px "Playfair Display",serif', margin: '10px 0' }}>
          {error || 'Booking not found.'}
        </h1>
        <p style={{ color: '#7c6f60', fontSize: 13 }}>
          If you completed payment, your booking is still being confirmed. You may check again
          shortly or contact JESS with your reference number.
        </p>
        <Link href="/book" className="btn btn-primary" style={{ marginTop: 20, display: 'inline-flex' }}>
          Book again
        </Link>
      </div>
    );
  }

  const isPaid = booking.status === 'paid';
  const isPending = booking.status === 'pending';
  const isCancelled = booking.status === 'cancelled';
  const isCompleted = booking.status === 'completed';

  const arrivalMin = booking.departureHour * 60 + Math.round(booking.travelHours * 60);
  const completionMin = booking.departureHour * 60 + booking.committedHours * 60;

  return (
    <div className="booking-result">
      <p className="eyebrow" style={{ color: '#9e7831' }}>BOOKING {status === 'cancelled' ? 'CANCELLED' : 'CONFIRMATION'}</p>
      <div className="ref">{booking.reference}</div>

      <span className={`status-badge status-${booking.status}`}>
        {booking.status === 'paid' && 'Payment confirmed'}
        {booking.status === 'pending' && 'Awaiting payment'}
        {booking.status === 'completed' && 'Appointment completed'}
        {booking.status === 'cancelled' && 'Booking cancelled'}
      </span>

      <p style={{ color: '#5b5047', fontSize: 13, lineHeight: 1.7, margin: '20px 0 0' }}>
        {isPaid &&
          'Thank you! Your reservation fee has been received. Your appointment is confirmed. JESS will arrive at your address around the estimated arrival time.'}
        {isPending &&
          (booking.paymentCheck === 'unavailable'
            ? 'We could not check your payment with PayRex just now. Your booking is still awaiting confirmation. Please check the status again shortly.'
            : 'Your booking is awaiting payment confirmation from PayRex. This page checks again automatically for about a minute.')}
        {isCompleted && 'Your appointment has been marked as completed. Thank you for choosing JESS Salon at Home!'}
        {isCancelled &&
          `This booking was cancelled${
            booking.cancellationReason === 'payment_timeout'
              ? ' because the reservation fee was not paid within the hold period.'
              : booking.cancellationReason === 'admin_cancellation'
              ? ' by JESS. Please contact us if you have questions.'
              : '.'
          }`}
      </p>

      <div className="result-detail">
        <div className="ac-grid">
          <div className="row"><span className="k">Customer</span><span className="v">{booking.customerName}</span></div>
          <div className="row"><span className="k">Email</span><span className="v">{booking.customerEmail}</span></div>
          <div className="row"><span className="k">Mobile</span><span className="v">{booking.customerMobile}</span></div>
          <div className="row"><span className="k">Service area</span><span className="v">{booking.serviceAreaLabel}</span></div>
          <div className="row"><span className="k">Date</span><span className="v">{formatDateLong(booking.appointmentDate)}</span></div>
          <div className="row"><span className="k">Departure</span><span className="v">{formatTime(booking.departureHour * 60)}</span></div>
          <div className="row"><span className="k">Est. arrival</span><span className="v">{formatTime(arrivalMin)}</span></div>
          <div className="row"><span className="k">Est. completion</span><span className="v">{formatTime(completionMin)}</span></div>
        </div>

        <div className="ac-services">
          <h6>Selected services</h6>
          {booking.haircutQuantity > 0 && (
            <div className="svc"><b>{booking.haircutQuantity} haircut(s)</b></div>
          )}
          {booking.majorSelections.map((m, i) => (
            <div className="svc" key={i}>
              <b>{m.name}</b>
              <small> · {m.variantLabel} · {formatCurrency(m.price)} · {m.durationHours}h</small>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div className="row"><span className="k">Total service price</span><span className="v">{formatCurrency(booking.totalPrice)}</span></div>
          <div className="row"><span className="k">Reservation fee paid</span><span className="v">{isPaid ? formatCurrency(booking.reservationFee) : '—'}</span></div>
          <div className="row"><span className="k">Remaining balance (cash)</span><span className="v">{formatCurrency(booking.remainingBalance)}</span></div>
        </div>
      </div>

      {isPending && (
        <p className="slot-note" style={{ marginTop: 18 }}>
          <button className="btn btn-ghost" onClick={() => window.location.reload()}>
            Check payment status
          </button>
        </p>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
        <Link href="/" className="btn btn-ghost">Back to home</Link>
        <Link href="/services" className="btn btn-ghost">View services</Link>
      </div>
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <main className="page-main">
      <Suspense fallback={<div className="booking-result">Loading…</div>}>
        <ConfirmationContent />
      </Suspense>
    </main>
  );
}
