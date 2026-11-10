"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/site-shell";
import { type BookingDetail, type BookingStatus } from "@/lib/types";

function ResultContent() {
  const params = useSearchParams();
  const ref = params.get("ref") ?? "";
  const urlStatus = params.get("status"); // 'success' | 'cancel' | null

  const [booking, setBooking] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(!!ref);
  const [notFound, setNotFound] = useState(false);
  const [accessUnavailable, setAccessUnavailable] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const MAX_ATTEMPTS = 6; // 6 × 5s = 30s

  // Used by the polling interval (called from a callback, not an effect body).
  const pollBooking = async () => {
    if (!ref) return;
    const accessToken = window.sessionStorage.getItem(`booking-access:${ref}`);
    if (!accessToken) return;
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(ref)}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.status === 401) {
        setAccessUnavailable(true);
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) return;
      const data: BookingDetail = await res.json();
      setBooking(data);
    } catch {
      /* swallow — will retry on next tick */
    }
  };

  useEffect(() => {
    if (!ref) return;
    let cancelled = false;
    const accessToken = window.sessionStorage.getItem(`booking-access:${ref}`);
    if (!accessToken) {
      queueMicrotask(() => {
        if (cancelled) return;
        setAccessUnavailable(true);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    fetch(`/api/bookings/${encodeURIComponent(ref)}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(async (r) => {
        if (cancelled) return;
        if (r.status === 401) {
          setAccessUnavailable(true);
          setLoading(false);
          return;
        }
        if (r.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!r.ok) {
          setLoading(false);
          return;
        }
        const data: BookingDetail = await r.json();
        if (cancelled) return;
        setBooking(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ref]);

  // Auto-refresh while pending (up to 30 seconds).
  useEffect(() => {
    if (!booking) return;
    if (booking.status !== "pending_payment") return;
    if (timedOut) return;

    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      void pollBooking();
      if (attempts >= MAX_ATTEMPTS) {
        setTimedOut(true);
        window.clearInterval(id);
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [booking?.status, timedOut]);

  if (!ref) {
    return (
      <div className="booking-shell">
        <div className="booking-wrap">
          <div className="booking-result">
            <div className="result-icon" aria-hidden="true">
              !
            </div>
            <h1>No booking reference found</h1>
            <p>
              We couldn&apos;t find a booking reference in the URL. If you just
              completed a booking, please check your link or contact JESS.
            </p>
            <Link href="/" className="btn btn-dark">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="booking-shell">
        <div className="booking-wrap">
          <div className="booking-result">
            <div className="result-icon" aria-hidden="true">
              …
            </div>
            <h1>Looking up your booking…</h1>
            <p>One moment while we fetch the details for {ref}.</p>
          </div>
        </div>
      </div>
    );
  }

  if (accessUnavailable || notFound || !booking) {
    return (
      <div className="booking-shell">
        <div className="booking-wrap">
          <div className="booking-result fail">
            <div className="result-icon" aria-hidden="true">
              ✕
            </div>
            <h1>{accessUnavailable ? "Booking access unavailable" : "Booking not found"}</h1>
            <p>
              {accessUnavailable
                ? "Open this page in the same browser used to create the booking. If you still cannot access it, contact JESS and quote reference "
                : "We couldn&apos;t find a booking with reference "}
              <span className="ref">{ref}</span>.
            </p>
            <Link href="/" className="btn btn-dark">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const status: BookingStatus = booking.status;

  if (status === "pending_payment") {
    return (
      <div className="booking-shell">
        <div className="booking-wrap">
          <div className="booking-result">
            <div className="result-icon" aria-hidden="true">
              …
            </div>
            <h1>Confirming your payment…</h1>
            <p>
              We&apos;re confirming your payment. This usually takes a few
              seconds. Please don&apos;t close this page.
            </p>
            <p style={{ marginBottom: 22 }}>
              Reference: <span className="ref">{booking.reference}</span>
            </p>
            {timedOut ? (
              <div className="combo-warning" style={{ textAlign: "left" }}>
                <strong style={{ display: "block", marginBottom: 6 }}>
                  Still not confirmed?
                </strong>
                If you completed payment but this page is still showing after a
                minute, please contact JESS and quote reference{" "}
                <strong>{booking.reference}</strong>. We&apos;ll sort it out
                right away.
              </div>
            ) : (
              <p className="booking-help">
                This page will refresh automatically.
              </p>
            )}
            <Link href="/" className="btn btn-ghost">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="booking-shell">
        <div className="booking-wrap">
          <div className="booking-result fail">
            <div className="result-icon" aria-hidden="true">
              ✕
            </div>
            <h1>Booking not completed</h1>
            <p>
              Your reservation was cancelled
              {booking.cancellationReason === "payment_timeout"
                ? " because the payment wasn&apos;t completed in time"
                : urlStatus === "cancel"
                  ? " because the payment was cancelled"
                  : ""}.{" "}
              No charge was made. You&apos;re welcome to start a new booking
              whenever you&apos;re ready.
            </p>
            <p style={{ marginBottom: 22 }}>
              Reference: <span className="ref">{booking.reference}</span>
            </p>
            <Link href="/book" className="btn btn-gold">
              Start a new booking
            </Link>
            <Link href="/" className="btn btn-ghost" style={{ marginLeft: 10 }}>
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // status === 'paid' (or 'completed')
  return (
    <div className="booking-shell">
      <div className="booking-wrap">
        <div className="booking-result success">
          <div className="result-icon" aria-hidden="true">
            ✓
          </div>
          <h1>Booking confirmed</h1>
          <p>
            Thank you! Your reservation is locked in. We&apos;ll see you on{" "}
            <strong>{booking.appointmentDate}</strong> at{" "}
            <strong>{booking.departureLabel}</strong> (departure time — JESS
            arrives around <strong>{booking.arrivalLabel}</strong>).
          </p>
          <p style={{ marginBottom: 8 }}>
            Reference: <span className="ref">{booking.reference}</span>
          </p>

          <div
            className="summary-grid"
            style={{ textAlign: "left", marginTop: 22 }}
          >
            <div className="summary-block">
              <h4>Appointment</h4>
              <div className="summary-row">
                <span className="label">Date</span>
                <span className="value">{booking.appointmentDate}</span>
              </div>
              <div className="summary-row">
                <span className="label">Departure</span>
                <span className="value">{booking.departureLabel}</span>
              </div>
              <div className="summary-row">
                <span className="label">Est. arrival</span>
                <span className="value">{booking.arrivalLabel}</span>
              </div>
              <div className="summary-row">
                <span className="label">Est. completion</span>
                <span className="value">{booking.completionLabel}</span>
              </div>
              <div className="summary-row">
                <span className="label">Service area</span>
                <span className="value">{booking.area}</span>
              </div>
            </div>

            <div className="summary-block">
              <h4>Services &amp; payment</h4>
              {booking.items.map((it, i) => (
                <div className="summary-row" key={i}>
                  <span className="label">
                    {it.serviceName}
                    {it.variantName ? ` · ${it.variantName}` : ""}
                    {it.quantity > 1 ? ` ×${it.quantity}` : ""}
                  </span>
                  <span className="value" style={{ textAlign: "right" }}>
                    {it.linePriceLabel}
                  </span>
                </div>
              ))}
              <div className="summary-row total">
                <span className="label">Services total</span>
                <span className="value">{booking.totalServicePriceLabel}</span>
              </div>
              <div className="summary-row gold">
                <span className="label">Reservation fee paid</span>
                <span className="value">{booking.reservationFeeLabel}</span>
              </div>
              <div className="summary-row">
                <span className="label">Cash balance at appointment</span>
                <span className="value">
                  {booking.remainingBalanceLabel}
                </span>
              </div>
            </div>
          </div>

          <p
            className="booking-help"
            style={{ marginTop: 18, marginBottom: 22 }}
          >
            Please have the cash balance of{" "}
            <strong>{booking.remainingBalanceLabel}</strong> ready at the
            appointment. The reservation fee you just paid is non-refundable and
            is already deducted from this balance.
          </p>

          <Link href="/" className="btn btn-gold">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function BookResultPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="booking-shell">
            <div className="booking-wrap">
              <div className="booking-result">
                <div className="result-icon" aria-hidden="true">
                  …
                </div>
                <h1>Loading…</h1>
                <p>One moment while we look up your booking.</p>
              </div>
            </div>
          </div>
        }
      >
        <ResultContent />
      </Suspense>
    </AppShell>
  );
}
