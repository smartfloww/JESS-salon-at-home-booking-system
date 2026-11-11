'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency, formatDateLong, formatTime } from '@/lib/booking';
import '@/components/booking/booking.css';

type TabStatus = 'pending' | 'paid' | 'completed';

interface MajorSel {
  serviceId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  price: number;
  durationHours: number;
}

interface Booking {
  id: string;
  reference: string;
  status: string;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  service_address: string;
  service_area_label: string;
  haircut_quantity: number;
  haircut_type_notes: string | null;
  major_selections: MajorSel[];
  total_price: number;
  reservation_fee: number;
  remaining_balance: number;
  appointment_date: string;
  departure_hour: number;
  committed_hours: number;
  travel_hours: number;
  service_hours: number;
  checkout_session_id: string | null;
  payment_reference: string | null;
  payment_verified_at: string | null;
  lock_expires_at: string | null;
  created_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
}

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<TabStatus>('paid');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [configError, setConfigError] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ booking: Booking; type: 'cancel' } | null>(null);
  const [cancelNote, setCancelNote] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    // Default tab is always Paid.
    setTab('paid');
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`/api/admin/bookings?status=${tab}`)
      .then(async (r) => {
        if (cancelled) return;
        const data = await r.json().catch(() => ({}));
        if (r.status === 401) {
          router.replace('/admin/login?next=/admin');
          return;
        }
        if (!r.ok) {
          if (r.status === 503) setConfigError(data.error || 'Database not configured.');
          else setError(data.error || 'Failed to load bookings.');
          setBookings([]);
          return;
        }
        setConfigError('');
        setBookings(data.bookings ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Network error.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, router]);

  // Load counts for all tabs (lightweight).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/admin/bookings?status=pending').then((r) => r.json()),
      fetch('/api/admin/bookings?status=paid').then((r) => r.json()),
      fetch('/api/admin/bookings?status=completed').then((r) => r.json()),
    ])
      .then(([p, paid, done]) => {
        if (cancelled) return;
        setCounts({
          pending: p.bookings?.length ?? 0,
          paid: paid.bookings?.length ?? 0,
          completed: done.bookings?.length ?? 0,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookings]);

  async function doComplete(b: Booking) {
    setActionLoading(b.id);
    try {
      const r = await fetch(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || 'Could not complete booking.');
        return;
      }
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
    } finally {
      setActionLoading(null);
    }
  }

  async function doCancel(b: Booking, note: string) {
    setActionLoading(b.id);
    try {
      const r = await fetch(`/api/admin/bookings/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', note }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data.error || 'Could not cancel booking.');
        return;
      }
      setBookings((prev) => prev.filter((x) => x.id !== b.id));
      setConfirmAction(null);
      setCancelNote('');
    } finally {
      setActionLoading(null);
    }
  }

  async function signOut() {
    const { createBrowserClientSafe } = await import('@/lib/supabase/browser');
    const supabase = createBrowserClientSafe();
    await supabase.auth.signOut();
    router.replace('/admin/login');
    router.refresh();
  }

  return (
    <div className="admin-root">
      <header className="admin-header">
        <Link href="/" className="brand">
          <img className="brand-logo" src="/imgs/logo.jpeg" alt="" />
          <span className="brand-wordmark">
            <span className="brand-name">JESS<span className="brand-period">.</span></span>
            <span className="brand-caption">ADMIN DASHBOARD</span>
          </span>
        </Link>
        <button className="signout" onClick={signOut} style={{ color: '#d2c9bd', border: '1px solid rgba(246,240,231,.3)', padding: '9px 14px', background: 'transparent', cursor: 'pointer', fontSize: 11, letterSpacing: '.06em' }}>
          Sign out
        </button>
      </header>

      <main className="admin-main">
        <h1 style={{ font: '500 30px "Playfair Display",serif', margin: '0 0 6px' }}>Bookings</h1>
        <p style={{ color: '#7c6f60', fontSize: 13, margin: '0 0 24px' }}>
          Manage your appointments. Default view shows Paid upcoming appointments.
        </p>

        {configError && <div className="admin-config-err">{configError}</div>}
        {error && !configError && <div className="admin-config-err">{error}</div>}

        <div className="admin-tabs">
          <button className={`admin-tab ${tab === 'pending' ? 'active' : ''}`} onClick={() => setTab('pending')}>
            Pending {counts.pending !== undefined && <span className="count">{counts.pending}</span>}
          </button>
          <button className={`admin-tab ${tab === 'paid' ? 'active' : ''}`} onClick={() => setTab('paid')}>
            Paid {counts.paid !== undefined && <span className="count">{counts.paid}</span>}
          </button>
          <button className={`admin-tab ${tab === 'completed' ? 'active' : ''}`} onClick={() => setTab('completed')}>
            Completed {counts.completed !== undefined && <span className="count">{counts.completed}</span>}
          </button>
        </div>

        {tab === 'pending' && (
          <p className="slot-note" style={{ marginBottom: 16 }}>
            Bookings awaiting payment verification. JESS cannot manually mark these as Paid —
            payment is confirmed only through PayRex.
          </p>
        )}

        {loading ? (
          <div className="admin-loading">Loading bookings…</div>
        ) : bookings.length === 0 ? (
          <div className="admin-empty">No {tab} bookings.</div>
        ) : (
          bookings.map((b) => (
            <BookingCard
              key={b.id}
              b={b}
              tab={tab}
              onComplete={() => doComplete(b)}
              onCancel={() => {
                setConfirmAction({ booking: b, type: 'cancel' });
                setCancelNote('');
              }}
              actionLoading={actionLoading === b.id}
            />
          ))
        )}
      </main>

      {confirmAction && (
        <ConfirmDialog
          booking={confirmAction.booking}
          note={cancelNote}
          onNote={setCancelNote}
          onConfirm={() => doCancel(confirmAction.booking, cancelNote)}
          onCancel={() => {
            setConfirmAction(null);
            setCancelNote('');
          }}
          loading={actionLoading === confirmAction.booking.id}
        />
      )}
    </div>
  );
}

function BookingCard({
  b,
  tab,
  onComplete,
  onCancel,
  actionLoading,
}: {
  b: Booking;
  tab: TabStatus;
  onComplete: () => void;
  onCancel: () => void;
  actionLoading: boolean;
}) {
  const arrivalMin = b.departure_hour * 60 + Math.round(b.travel_hours * 60);
  const completionMin = b.departure_hour * 60 + b.committed_hours * 60;

  return (
    <div className="admin-card">
      <div className="ac-top">
        <div>
          <p className="ac-name">{b.customer_name}</p>
          <p className="ac-meta">
            {b.reference} · {b.service_area_label} · {formatDateLong(b.appointment_date)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="ac-date">
            Dep {formatTime(b.departure_hour * 60)} → Done {formatTime(completionMin)}
          </div>
          <div style={{ fontSize: 11, color: '#8a7e70', marginTop: 4 }}>
            Arrive ~{formatTime(arrivalMin)}
          </div>
        </div>
      </div>

      <div className="ac-grid">
        <div className="row"><span className="k">Email</span><span className="v">{b.customer_email}</span></div>
        <div className="row"><span className="k">Mobile</span><span className="v">{b.customer_mobile}</span></div>
        <div className="row" style={{ gridColumn: '1 / -1' }}>
          <span className="k">Address</span>
          <span className="v" style={{ textAlign: 'right' }}>{b.service_address}</span>
        </div>
        <div className="row"><span className="k">Total price</span><span className="v">{formatCurrency(b.total_price)}</span></div>
        <div className="row"><span className="k">Reservation paid</span><span className="v">{formatCurrency(b.reservation_fee)}</span></div>
        <div className="row"><span className="k">Cash balance</span><span className="v">{formatCurrency(b.remaining_balance)}</span></div>
        <div className="row"><span className="k">Reserved block</span><span className="v">{b.committed_hours}h ({b.service_hours}h svc + {b.travel_hours}h travel)</span></div>
        {b.payment_reference && (
          <div className="row"><span className="k">Payment ref</span><span className="v" style={{ fontSize: 10 }}>{b.payment_reference}</span></div>
        )}
        {b.cancellation_reason && (
          <div className="row"><span className="k">Cancelled</span><span className="v" style={{ fontSize: 11 }}>{b.cancellation_reason}</span></div>
        )}
      </div>

      <div className="ac-services">
        <h6>Services</h6>
        {b.haircut_quantity > 0 && (
          <div className="svc">
            <b>{b.haircut_quantity} haircut(s)</b>
            {b.haircut_type_notes && <small> · {b.haircut_type_notes}</small>}
          </div>
        )}
        {b.major_selections.map((m, i) => (
          <div className="svc" key={i}>
            <b>{m.name}</b>
            <small> · {m.variantLabel} · {formatCurrency(m.price)} · {m.durationHours}h</small>
          </div>
        ))}
      </div>

      {tab === 'paid' && (
        <div className="ac-actions">
          <button className="btn btn-success" onClick={onComplete} disabled={actionLoading}>
            Mark completed
          </button>
          <button className="btn btn-danger" onClick={onCancel} disabled={actionLoading}>
            Cancel booking
          </button>
        </div>
      )}
      {tab === 'pending' && (
        <div className="ac-actions">
          <button className="btn btn-danger" onClick={onCancel} disabled={actionLoading}>
            Cancel booking
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  booking,
  note,
  onNote,
  onConfirm,
  onCancel,
  loading,
}: {
  booking: Booking;
  note: string;
  onNote: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <div className="confirm-dialog-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Cancel this booking?</h3>
        <p>
          You are about to cancel <b>{booking.reference}</b> for {booking.customer_name}. This
          releases the reserved time slot. The booking record is kept for history.
          {booking.status === 'paid' && ' The reservation fee is non-refundable.'}
        </p>
        <textarea
          placeholder="Optional note (visible to you only)"
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
        <div className="actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Keep booking
          </button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Cancelling…' : 'Confirm cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
