"use client";

/**
 * JESS admin dashboard — interactive client component.
 *
 * Renders its own chrome (`.admin-shell` / `.admin-header` / `.admin-tabs`
 * / `.admin-body`). NOT wrapped in <AppShell>.
 *
 * Tab default is ALWAYS "paid" per the brief. Fetches
 * `/api/admin/bookings?status=…` whenever the active tab changes, and
 * refetches after a Complete / Cancel / Cleanup action so the list stays
 * current. Complete & Cancel are gated behind explicit confirmations
 * (Cancel requires a second AlertDialog confirmation).
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  formatDuration,
  formatPHP,
  type AdminBooking,
  type BookingStatus,
  type PaymentStatus,
} from "@/lib/types";

type Tab = "pending_payment" | "paid" | "completed";

const TABS: { id: Tab; label: string }[] = [
  { id: "pending_payment", label: "Pending" },
  { id: "paid", label: "Paid" },
  { id: "completed", label: "Completed" },
];

function formatDate(iso: string): string {
  // appointmentDate is "YYYY-MM-DD" (Manila). Parse as local calendar date.
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return iso;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDeadline(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function StatusPill({ status }: { status: BookingStatus }) {
  const map: Record<BookingStatus, { cls: string; label: string }> = {
    pending_payment: { cls: "status-pill status-pending", label: "Pending payment" },
    paid: { cls: "status-pill status-paid", label: "Paid" },
    completed: { cls: "status-pill status-completed", label: "Completed" },
    cancelled: { cls: "status-pill status-cancelled", label: "Cancelled" },
  };
  const s = map[status];
  return <span className={s.cls}>{s.label}</span>;
}

function PaymentPill({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { cls: string; label: string }> = {
    successful: { cls: "status-pill status-completed", label: "Successful" },
    pending: { cls: "status-pill status-pending", label: "Pending" },
    failed: { cls: "status-pill status-cancelled", label: "Failed" },
  };
  const s = map[status];
  return <span className={s.cls}>{s.label}</span>;
}

interface BookingCardProps {
  b: AdminBooking;
  completingId: string | null;
  onMarkComplete: (id: string) => void;
  onCancel: (b: AdminBooking) => void;
}

function BookingCard({
  b,
  completingId,
  onMarkComplete,
  onCancel,
}: BookingCardProps) {
  const isCompleting = completingId === b.id;
  return (
    <article className="admin-card">
      <div>
        <div className="ac-head">
          <h3 className="ac-name">{b.customer.fullName}</h3>
          <div className="ac-meta">
            <span>Ref {b.reference}</span>
            <span aria-hidden="true"> · </span>
            <StatusPill status={b.status} />
            <span aria-hidden="true"> · </span>
            <span>{formatDate(b.appointmentDate)}</span>
            <span aria-hidden="true"> · </span>
            <span>Departs {b.departureLabel}</span>
          </div>
        </div>

        <div className="ac-block">
          <div>
            <h5>Contact &amp; address</h5>
            <p>{b.customer.fullName}</p>
            <p>{b.customer.phone}</p>
            {b.customer.email ? <p>{b.customer.email}</p> : null}
            <p>{b.customer.address}</p>
            <p>
              {b.customer.barangay}, {b.customer.city}, {b.customer.province}
            </p>
            {b.customer.landmark ? <p>Landmark: {b.customer.landmark}</p> : null}
            <p>Service area: {b.area}</p>
          </div>
          <div>
            <h5>Appointment</h5>
            <p>Date: {formatDate(b.appointmentDate)}</p>
            <p>Departure: {b.departureLabel}</p>
            <p>Est. arrival: {b.arrivalLabel}</p>
            <p>Est. completion: {b.completionLabel}</p>
            <p>Travel: {b.travelLabel}</p>
            <p>Service: {b.serviceLabel}</p>
            <p>Total reserved: {b.reservedLabel}</p>
          </div>
        </div>

        <div className="ac-block">
          <div>
            <h5>Services</h5>
            <ul>
              {b.items.map((it, i) => (
                <li key={i}>
                  {it.serviceName}
                  {it.variantName ? ` — ${it.variantName}` : ""} ×{it.quantity} —{" "}
                  {it.linePriceLabel} · {it.lineDurationLabel}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h5>Payment</h5>
            <p>Total service price: {b.totalServicePriceLabel}</p>
            <p>Reservation fee paid: {b.reservationFeeLabel}</p>
            <p>Remaining cash balance: {b.remainingBalanceLabel}</p>
            <p>
              Payment status: <PaymentPill status={b.paymentStatus} />
            </p>
            {b.paymentProviderRef ? <p>Provider ref: {b.paymentProviderRef}</p> : null}
            {b.status === "pending_payment" && b.paymentDeadline ? (
              <p>Payment deadline: {formatDeadline(b.paymentDeadline)}</p>
            ) : null}
          </div>
        </div>
      </div>

      {b.status === "paid" ? (
        <div className="ac-actions">
          <button
            type="button"
            className="btn btn-dark"
            onClick={() => onMarkComplete(b.id)}
            disabled={isCompleting}
          >
            {isCompleting ? "Marking…" : "Mark Completed"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ color: "#a44a3a", borderColor: "rgba(164,74,58,.35)" }}
            onClick={() => onCancel(b)}
            disabled={isCompleting}
          >
            Cancel booking
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function AdminDashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("paid");
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminBooking | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cleaningUp, setCleaningUp] = useState(false);

  const fetchBookings = useCallback(
    async (tab: Tab) => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/bookings?status=${tab}`, {
          cache: "no-store",
        });
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { bookings: AdminBooking[] };
        setBookings(data.bookings ?? []);
      } catch {
        toast.error("Could not load bookings.");
        setBookings([]);
      } finally {
        setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void fetchBookings(activeTab);
  }, [activeTab, fetchBookings]);

  const refresh = useCallback(() => {
    void fetchBookings(activeTab);
  }, [activeTab, fetchBookings]);

  const markComplete = useCallback(
    async (id: string) => {
      setCompletingId(id);
      try {
        const res = await fetch(`/api/admin/bookings/${id}/complete`, {
          method: "PATCH",
        });
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        toast.success("Booking marked as completed.");
        await fetchBookings(activeTab);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not mark booking completed.",
        );
      } finally {
        setCompletingId(null);
      }
    },
    [activeTab, fetchBookings, router],
  );

  const confirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      const res = await fetch(
        `/api/admin/bookings/${cancelTarget.id}/cancel`,
        { method: "PATCH" },
      );
      if (res.status === 401) {
        setCancelTarget(null);
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success("Booking cancelled. Time slot released.");
      setCancelTarget(null);
      await fetchBookings(activeTab);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not cancel booking.",
      );
    } finally {
      setCancelling(false);
    }
  }, [cancelTarget, activeTab, fetchBookings, router]);

  const runCleanup = useCallback(async () => {
    setCleaningUp(true);
    try {
      const res = await fetch("/api/admin/cleanup", { method: "POST" });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as { ok: boolean; released: number };
      toast.success(
        `Cleanup done. ${data.released} expired pending booking(s) released.`,
      );
      await fetchBookings(activeTab);
    } catch {
      toast.error("Could not run cleanup.");
    } finally {
      setCleaningUp(false);
    }
  }, [activeTab, fetchBookings, router]);

  const handleSignOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Could not sign out. Please try again.");
      return;
    }
    router.replace("/admin/login");
    router.refresh();
  }, [router]);

  const emptyLabel =
    activeTab === "pending_payment"
      ? "No bookings awaiting payment."
      : activeTab === "paid"
        ? "No paid bookings right now."
        : "No completed bookings yet.";

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          <span className="brand-wordmark">
            <span className="brand-name">
              JESS<span className="brand-period">.</span>
            </span>
            <span className="brand-caption">SALON AT HOME</span>
          </span>
          <span
            style={{
              fontSize: 9,
              letterSpacing: ".13em",
              textTransform: "uppercase",
              color: "var(--gold)",
              border: "1px solid rgba(212,181,104,.5)",
              padding: "3px 7px",
            }}
          >
            Admin
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ color: "var(--ivory)", borderColor: "rgba(246,240,231,.3)" }}
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </header>

      <nav className="admin-tabs" aria-label="Booking status filter">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`admin-tab${t.id === activeTab ? " active" : ""}`}
            aria-pressed={t.id === activeTab}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="admin-body">
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={runCleanup}
            disabled={cleaningUp}
          >
            {cleaningUp ? "Cleaning…" : "Run cleanup"}
          </button>
        </div>

        {loading ? (
          <div className="empty-state">Loading bookings…</div>
        ) : bookings.length === 0 ? (
          <div className="empty-state">{emptyLabel}</div>
        ) : (
          <div className="admin-list">
            {bookings.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                completingId={completingId}
                onMarkComplete={markComplete}
                onCancel={setCancelTarget}
              />
            ))}
          </div>
        )}
      </main>

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(open) => {
          if (!open && !cancelling) {
            setCancelTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will release the reserved time slot. The customer&apos;s
              payment record will be preserved. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>
              No, keep it
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelling}
              onClick={(e) => {
                // Prevent radix auto-close so we can drive the dialog from
                // async state (and keep it open while the request is in flight).
                e.preventDefault();
                void confirmCancel();
              }}
              style={{ background: "#a44a3a", color: "#fff" }}
            >
              {cancelling ? "Cancelling…" : "Yes, cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
