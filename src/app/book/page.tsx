"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/site-shell";
import {
  formatPHP,
  formatDuration,
  type AreaDTO,
  type AvailabilitySlot,
  type CustomerInfo,
  type SelectedItem,
  type ServiceDTO,
  type ServiceGroupDTO,
} from "@/lib/types";
import {
  BOOKING_RULES_TEXT,
  MAX_HAIRCUTS_PER_BOOKING,
  canAddUnit,
  countCombo,
  validateCombo,
} from "@/lib/booking-rules";

// ---------------------------------------------------------------------------
// Pricing constants (kept in sync with src/lib/catalogue.ts).
// ---------------------------------------------------------------------------
const HAIRCUT_BASE_PRICE = 99900; // ₱999
const HAIRCUT_BASE_DURATION = 60; // 1 hour
const ADDITIONAL_HAIRCUT_PERSON = 50000; // +₱500
const RESERVATION_FEE_HAIRCUT = 50000; // ₱500
const RESERVATION_FEE_MAJOR = 150000; // ₱1,500

const emptyCustomer: CustomerInfo = {
  fullName: "",
  phone: "",
  email: "",
  address: "",
  barangay: "",
  city: "",
  province: "",
  landmark: "",
};

interface BookState {
  step: 1 | 2 | 3 | 4;
  areaId: string | null;
  areaName: string | null;
  travelMinutes: number;
  items: SelectedItem[];
  customer: CustomerInfo;
  appointmentDate: string;
  departureTime: number | null;
  acceptedPolicy: boolean;
}

const initialState: BookState = {
  step: 1,
  areaId: null,
  areaName: null,
  travelMinutes: 0,
  items: [],
  customer: { ...emptyCustomer },
  appointmentDate: "",
  departureTime: null,
  acceptedPolicy: false,
};

// ---------------------------------------------------------------------------
// Client-safe pure helpers (mirror of server-side scheduling helpers).
// We avoid importing the server-side scheduling module into the client bundle.
// ---------------------------------------------------------------------------
function manilaToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}

function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Pricing helpers (client-side preview; backend re-prices authoritatively).
// ---------------------------------------------------------------------------
function haircutLinePrice(quantity: number): number {
  if (quantity <= 0) return 0;
  return HAIRCUT_BASE_PRICE + (quantity - 1) * ADDITIONAL_HAIRCUT_PERSON;
}

function linePriceOf(item: SelectedItem): number {
  if (item.unitCategory === "haircut") return haircutLinePrice(item.quantity);
  return item.unitPrice * item.quantity;
}

function lineDurationOf(item: SelectedItem): number {
  return item.unitDuration * item.quantity;
}

interface Totals {
  totalServicePrice: number;
  totalServiceMinutes: number;
  haircutCount: number;
  majorCount: number;
  reservationFee: number;
  remainingBalance: number;
}

function computeTotals(items: SelectedItem[]): Totals {
  let totalServicePrice = 0;
  let totalServiceMinutes = 0;
  let haircutCount = 0;
  let majorCount = 0;
  for (const it of items) {
    totalServicePrice += linePriceOf(it);
    totalServiceMinutes += lineDurationOf(it);
    if (it.unitCategory === "haircut") haircutCount += it.quantity;
    else majorCount += it.quantity;
  }
  const reservationFee =
    haircutCount * RESERVATION_FEE_HAIRCUT + majorCount * RESERVATION_FEE_MAJOR;
  const remainingBalance = Math.max(0, totalServicePrice - reservationFee);
  return {
    totalServicePrice,
    totalServiceMinutes,
    haircutCount,
    majorCount,
    reservationFee,
    remainingBalance,
  };
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------
const STEPS: Array<{ n: 1 | 2 | 3 | 4; label: string }> = [
  { n: 1, label: "Area" },
  { n: 2, label: "Services" },
  { n: 3, label: "Details" },
  { n: 4, label: "Review" },
];

function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <div className="booking-stepper" aria-label="Booking progress">
      {STEPS.map((s, i) => {
        const cls = s.n === current ? "active" : s.n < current ? "done" : "";
        return (
          <span style={{ display: "contents" }} key={s.n}>
            <div className={`booking-step ${cls}`}>
              <span className="step-num">{s.n}</span>
              <span>{s.label}</span>
            </div>
            {i < STEPS.length - 1 && <span className="booking-step-divider" />}
          </span>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Area
// ---------------------------------------------------------------------------
function StepArea({
  areas,
  loading,
  selectedId,
  onSelect,
  onContinue,
}: {
  areas: AreaDTO[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (a: AreaDTO) => void;
  onContinue: () => void;
}) {
  return (
    <div className="booking-card">
      <p className="eyebrow">STEP 1 — YOUR AREA</p>
      <h2>Where should JESS come to you?</h2>
      <p className="booking-help" style={{ marginBottom: 18 }}>
        Choose the city or province you are in. Travel time is one-way from
        JESS&apos;s base.
      </p>
      {loading ? (
        <p className="booking-help">Loading service areas…</p>
      ) : areas.length === 0 ? (
        <p className="booking-help">No service areas available right now.</p>
      ) : (
        <div className="area-grid">
          {areas.map((a) => (
            <button
              type="button"
              key={a.id}
              className={`area-card ${selectedId === a.id ? "selected" : ""}`}
              onClick={() => onSelect(a)}
              aria-pressed={selectedId === a.id}
            >
              <span className="area-tag">SERVICE AREA</span>
              <b>{a.name}</b>
              <small>One-way travel: {formatDuration(a.travelMinutes)}</small>
            </button>
          ))}
        </div>
      )}
      <div className="booking-actions">
        <span />
        <button
          type="button"
          className="btn btn-gold"
          onClick={onContinue}
          disabled={!selectedId}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Services
// ---------------------------------------------------------------------------
function StepServices({
  groups,
  loading,
  items,
  onAddMajor,
  onRemoveMajor,
  onSetHaircutQty,
  onBack,
  onContinue,
}: {
  groups: ServiceGroupDTO[];
  loading: boolean;
  items: SelectedItem[];
  onAddMajor: (svc: ServiceDTO, variantName?: string) => void;
  onRemoveMajor: (svc: ServiceDTO, variantName?: string) => void;
  onSetHaircutQty: (svc: ServiceDTO, qty: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const counts = useMemo(() => countCombo(items), [items]);
  const comboCheck = useMemo(() => validateCombo(counts), [counts]);
  const canAddHaircut = canAddUnit(counts, "haircut");
  const canAddMajor = canAddUnit(counts, "major");
  const totals = useMemo(() => computeTotals(items), [items]);

  // Collapsible service groups — default open the first group only so the
  // customer is not overwhelmed by ~38 services at once. The first-group
  // default is computed via a useState initializer; the user's toggles
  // override it.
  const [userTouched, setUserTouched] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const effectiveOpen = userTouched
    ? openGroups
    : new Set(groups.length > 0 ? [groups[0].group] : []);
  const toggleGroup = (g: string) => {
    setUserTouched(true);
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const findMajorItem = (
    slug: string,
    variantName?: string,
  ): SelectedItem | undefined =>
    items.find(
      (it) =>
        it.serviceSlug === slug &&
        it.unitCategory === "major" &&
        (it.variantName ?? null) === (variantName ?? null),
    );

  const findHaircutQty = (slug: string): number => {
    const it = items.find(
      (x) => x.serviceSlug === slug && x.unitCategory === "haircut",
    );
    return it?.quantity ?? 0;
  };

  return (
    <div className="booking-card">
      <p className="eyebrow">STEP 2 — YOUR SERVICES</p>
      <h2>What would you like done?</h2>
      <div className="combo-hint">
        <strong style={{ display: "block", marginBottom: 6 }}>
          Booking combinations
        </strong>
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {BOOKING_RULES_TEXT.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      {loading ? (
        <p className="booking-help">Loading services…</p>
      ) : (
        <div className="service-pick-list">
          {groups.map((group) => {
            const isOpen = effectiveOpen.has(group.group);
            return (
            <div className={`service-pick${isOpen ? " is-open" : ""}`} key={group.group}>
              <button
                type="button"
                className="service-pick-head"
                onClick={() => toggleGroup(group.group)}
                aria-expanded={isOpen}
              >
                <h4>{group.group}</h4>
                <span className="pick-meta">
                  {group.items.length} service
                  {group.items.length === 1 ? "" : "s"} {isOpen ? "−" : "+"}
                </span>
              </button>
              {isOpen && (
              <div className="service-pick-body">
                {group.items.flatMap((svc) => {
                  if (svc.category === "haircut") {
                    const qty = findHaircutQty(svc.slug);
                    const linePrice = haircutLinePrice(qty);
                    const minusDisabled = qty === 0;
                    const plusDisabled =
                      qty >= MAX_HAIRCUTS_PER_BOOKING || !canAddHaircut.ok;
                    const plusTitle = !canAddHaircut.ok
                      ? canAddHaircut.reason
                      : qty >= MAX_HAIRCUTS_PER_BOOKING
                        ? "Maximum 5 haircuts per appointment."
                        : undefined;
                    return [
                      <div className="variant-row" key={svc.id}>
                        <div>
                          <div className="variant-name">{svc.name}</div>
                          <div className="variant-meta">
                            {formatPHP(HAIRCUT_BASE_PRICE)} ·{" "}
                            {formatDuration(HAIRCUT_BASE_DURATION)} per person
                          </div>
                        </div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <button
                            type="button"
                            className="variant-add"
                            style={{
                              padding: "6px 10px",
                              minWidth: 34,
                              minHeight: 34,
                            }}
                            onClick={() => onSetHaircutQty(svc, qty - 1)}
                            disabled={minusDisabled}
                            aria-label={`Remove one ${svc.name}`}
                          >
                            −
                          </button>
                          <span
                            aria-live="polite"
                            style={{
                              minWidth: 24,
                              textAlign: "center",
                              fontWeight: 600,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {qty}
                          </span>
                          <button
                            type="button"
                            className="variant-add"
                            style={{
                              padding: "6px 10px",
                              minWidth: 34,
                              minHeight: 34,
                            }}
                            onClick={() => onSetHaircutQty(svc, qty + 1)}
                            disabled={plusDisabled}
                            title={plusTitle}
                            aria-label={`Add one ${svc.name}`}
                          >
                            +
                          </button>
                          <span
                            className="variant-price"
                            style={{ marginLeft: 10, minWidth: 70, textAlign: "right" }}
                          >
                            {qty > 0 ? formatPHP(linePrice) : "—"}
                          </span>
                        </div>
                      </div>,
                    ];
                  }

                  // Major service with variants
                  if (svc.variants.length > 0) {
                    return svc.variants.map((v) => {
                      const added = findMajorItem(svc.slug, v.name);
                      const addDisabled = !added && !canAddMajor.ok;
                      const title = addDisabled ? canAddMajor.reason : undefined;
                      return (
                        <div className="variant-row" key={`${svc.id}-${v.id}`}>
                          <div>
                            <div className="variant-name">
                              {svc.name} · {v.name}
                            </div>
                            <div className="variant-meta">
                              {formatDuration(v.duration)}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 12,
                            }}
                          >
                            <span className="variant-price">
                              {formatPHP(v.price)}
                            </span>
                            {added ? (
                              <button
                                type="button"
                                className="variant-add"
                                style={{ background: "#1a1817", color: "#f6f0e7" }}
                                onClick={() => onRemoveMajor(svc, v.name)}
                              >
                                Added · remove
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="variant-add"
                                onClick={() => onAddMajor(svc, v.name)}
                                disabled={addDisabled}
                                title={title}
                              >
                                Add
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  }

                  // Major service without variants
                  const added = findMajorItem(svc.slug);
                  const addDisabled = !added && !canAddMajor.ok;
                  const title = addDisabled ? canAddMajor.reason : undefined;
                  return [
                    <div className="variant-row" key={svc.id}>
                      <div>
                        <div className="variant-name">{svc.name}</div>
                        <div className="variant-meta">
                          {formatDuration(svc.baseDuration)}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span className="variant-price">
                          {formatPHP(svc.basePrice)}
                        </span>
                        {added ? (
                          <button
                            type="button"
                            className="variant-add"
                            style={{ background: "#1a1817", color: "#f6f0e7" }}
                            onClick={() => onRemoveMajor(svc)}
                          >
                            Added · remove
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="variant-add"
                            onClick={() => onAddMajor(svc)}
                            disabled={addDisabled}
                            title={title}
                          >
                            Add
                          </button>
                        )}
                      </div>
                    </div>,
                  ];
                })}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="selected-items">
          <h4>Your selection</h4>
          {items.map((it) => (
            <div
              className="selected-item-row"
              key={`${it.serviceSlug}-${it.variantName ?? ""}`}
            >
              <span className="si-name">
                {it.serviceName}
                {it.variantName ? ` · ${it.variantName}` : ""}
                {it.quantity > 1 ? ` ×${it.quantity}` : ""}
              </span>
              <span className="si-meta">{formatDuration(lineDurationOf(it))}</span>
              <span className="si-price">{formatPHP(linePriceOf(it))}</span>
              <button
                type="button"
                onClick={() =>
                  it.unitCategory === "haircut"
                    ? onSetHaircutQty({ slug: it.serviceSlug } as ServiceDTO, 0)
                    : onRemoveMajor(
                        { slug: it.serviceSlug } as ServiceDTO,
                        it.variantName ?? undefined,
                      )
                }
                aria-label={`Remove ${it.serviceName}`}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "#a44a3a",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "4px 6px",
                }}
              >
                Remove
              </button>
            </div>
          ))}
          <div className="summary-row total" style={{ marginTop: 10, paddingTop: 10 }}>
            <span className="label">Services total</span>
            <span className="value">{formatPHP(totals.totalServicePrice)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Total service time</span>
            <span className="value">
              {formatDuration(totals.totalServiceMinutes)}
            </span>
          </div>
          <div className="summary-row">
            <span className="label">
              Haircuts ({totals.haircutCount}) · Majors ({totals.majorCount})
            </span>
            <span className="value">Reservation fee</span>
          </div>
          <div className="summary-row gold">
            <span className="label">Reservation fee due now</span>
            <span className="value">{formatPHP(totals.reservationFee)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Cash balance at appointment</span>
            <span className="value">{formatPHP(totals.remainingBalance)}</span>
          </div>
        </div>
      )}

      {!comboCheck.ok && items.length > 0 && (
        <div className="combo-warning">{comboCheck.reason}</div>
      )}

      <div className="booking-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="btn btn-gold"
          onClick={onContinue}
          disabled={items.length === 0 || !comboCheck.ok}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Customer info + appointment
// ---------------------------------------------------------------------------
function StepDetails({
  customer,
  onCustomerChange,
  appointmentDate,
  onDateChange,
  travelMinutes,
  serviceMinutes,
  departureTime,
  onDepartureChange,
  onReservedMinutes,
  onBack,
  onContinue,
}: {
  customer: CustomerInfo;
  onCustomerChange: (c: CustomerInfo) => void;
  appointmentDate: string;
  onDateChange: (d: string) => void;
  travelMinutes: number;
  serviceMinutes: number;
  departureTime: number | null;
  onDepartureChange: (m: number | null) => void;
  onReservedMinutes: (m: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [reservedMinutes, setReservedMinutes] = useState<number>(0);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const today = manilaToday();

  useEffect(() => {
    if (!appointmentDate || serviceMinutes <= 0) {
      // No valid date / services — skip the fetch. The JSX guards on
      // !appointmentDate so we don't need to clear `slots` here.
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoadingSlots(true);
      setSlotError(null);
      const url = `/api/availability?date=${encodeURIComponent(
        appointmentDate,
      )}&serviceMinutes=${serviceMinutes}&travelMinutes=${travelMinutes}`;
      try {
        const r = await fetch(url);
        if (cancelled) return;
        const data = await r.json();
        if (cancelled) return;
        if (data.error) {
          setSlots([]);
          setReservedMinutes(0);
          setSlotError(data.error);
        } else {
          setSlots(Array.isArray(data.available) ? data.available : []);
          const rm =
            typeof data.reservedMinutes === "number" ? data.reservedMinutes : 0;
          setReservedMinutes(rm);
          onReservedMinutes(rm);
          setSlotError(data.note ?? null);
        }
      } catch {
        if (cancelled) return;
        setSlots([]);
        setSlotError("Could not load available times. Please try again.");
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [appointmentDate, serviceMinutes, travelMinutes]);

  const setField = <K extends keyof CustomerInfo>(
    key: K,
    value: CustomerInfo[K],
  ) => {
    onCustomerChange({ ...customer, [key]: value });
  };

  const requiredFilled =
    !!customer.fullName.trim() &&
    !!customer.phone.trim() &&
    !!customer.address.trim() &&
    !!customer.barangay.trim() &&
    !!customer.city.trim() &&
    !!customer.province.trim();

  const canContinue = requiredFilled && departureTime !== null;

  return (
    <div className="booking-card">
      <p className="eyebrow">STEP 3 — YOUR DETAILS</p>
      <h2>Where and when, exactly?</h2>
      <p className="booking-help" style={{ marginBottom: 18 }}>
        Tell us who and where. We&apos;ll show you the departure times that
        still fit JESS&apos;s schedule for the day you pick.
      </p>

      <div className="field">
        <label htmlFor="fullName">Full name *</label>
        <input
          id="fullName"
          type="text"
          value={customer.fullName}
          onChange={(e) => setField("fullName", e.target.value)}
          autoComplete="name"
        />
      </div>

      <div className="booking-row">
        <div className="field">
          <label htmlFor="phone">Mobile / contact number *</label>
          <input
            id="phone"
            type="tel"
            value={customer.phone}
            onChange={(e) => setField("phone", e.target.value)}
            autoComplete="tel"
          />
        </div>
        <div className="field">
          <label htmlFor="email">Email (optional)</label>
          <input
            id="email"
            type="email"
            value={customer.email ?? ""}
            onChange={(e) => setField("email", e.target.value)}
            autoComplete="email"
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="address">Complete service address *</label>
        <input
          id="address"
          type="text"
          value={customer.address}
          onChange={(e) => setField("address", e.target.value)}
          autoComplete="street-address"
        />
      </div>

      <div className="booking-row">
        <div className="field">
          <label htmlFor="barangay">Barangay *</label>
          <input
            id="barangay"
            type="text"
            value={customer.barangay}
            onChange={(e) => setField("barangay", e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="city">City / municipality *</label>
          <input
            id="city"
            type="text"
            value={customer.city}
            onChange={(e) => setField("city", e.target.value)}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="province">Province *</label>
        <input
          id="province"
          type="text"
          value={customer.province}
          onChange={(e) => setField("province", e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="landmark">
          Landmark or additional directions (optional)
        </label>
        <textarea
          id="landmark"
          value={customer.landmark ?? ""}
          onChange={(e) => setField("landmark", e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="apptDate">Appointment date *</label>
        <input
          id="apptDate"
          type="date"
          min={today}
          value={appointmentDate}
          onChange={(e) => onDateChange(e.target.value)}
        />
        <p className="booking-help">
          JESS operates daily, 8 AM – 6 PM (Manila time).
        </p>
      </div>

      <div className="field">
        <label>Departure time *</label>
        <p className="booking-help" style={{ marginBottom: 10 }}>
          Pick when JESS should leave her base. We&apos;ll estimate arrival and
          completion times below.
        </p>
        {!appointmentDate ? (
          <p className="booking-help">Pick a date first to see times.</p>
        ) : loadingSlots ? (
          <p className="booking-help">Checking availability…</p>
        ) : slots.length === 0 ? (
          <div className="combo-warning">
            {slotError ??
              "No departure times available for this date. Please pick another date."}
          </div>
        ) : (
          <div
            className="area-grid"
            role="radiogroup"
            aria-label="Available departure times"
          >
            {slots.map((s) => {
              const arrival = s.minutes + travelMinutes;
              const completion = s.minutes + reservedMinutes;
              const selected = departureTime === s.minutes;
              return (
                <button
                  type="button"
                  key={s.minutes}
                  role="radio"
                  aria-checked={selected}
                  className={`area-card ${selected ? "selected" : ""}`}
                  onClick={() => onDepartureChange(s.minutes)}
                >
                  <span className="area-tag">DEPARTURE</span>
                  <b>{formatTime(s.minutes)}</b>
                  <small>
                    Arrive {formatTime(arrival)} · Done {formatTime(completion)}
                  </small>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="booking-actions">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className="btn btn-gold"
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Review & pay
// ---------------------------------------------------------------------------
function StepReview({
  state,
  totals,
  reservedMinutes,
  onAcceptPolicy,
  onBack,
  onSubmit,
  submitting,
}: {
  state: BookState;
  totals: Totals;
  reservedMinutes: number;
  onAcceptPolicy: (v: boolean) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const c = state.customer;
  const fullAddress = [c.address, c.barangay, c.city, c.province]
    .filter(Boolean)
    .join(", ");
  const arrival = (state.departureTime ?? 0) + state.travelMinutes;
  const completion = (state.departureTime ?? 0) + reservedMinutes;

  return (
    <div className="booking-card">
      <p className="eyebrow">STEP 4 — REVIEW &amp; PAY</p>
      <h2>Almost there. Review and pay.</h2>
      <p className="booking-help" style={{ marginBottom: 18 }}>
        Please double-check the details below. When you&apos;re ready, pay the
        reservation fee to lock in your slot.
      </p>

      <div className="summary-grid">
        <div className="summary-block">
          <h4>Customer &amp; appointment</h4>
          <div className="summary-row">
            <span className="label">Name</span>
            <span className="value">{c.fullName}</span>
          </div>
          <div className="summary-row">
            <span className="label">Phone</span>
            <span className="value">{c.phone}</span>
          </div>
          {c.email && (
            <div className="summary-row">
              <span className="label">Email</span>
              <span className="value">{c.email}</span>
            </div>
          )}
          <div className="summary-row">
            <span className="label">Address</span>
            <span className="value" style={{ textAlign: "right" }}>
              {fullAddress}
            </span>
          </div>
          {c.landmark && (
            <div className="summary-row">
              <span className="label">Landmark</span>
              <span className="value" style={{ textAlign: "right" }}>
                {c.landmark}
              </span>
            </div>
          )}
          <div className="summary-row">
            <span className="label">Service area</span>
            <span className="value">{state.areaName}</span>
          </div>
          <div className="summary-row">
            <span className="label">Appointment date</span>
            <span className="value">{state.appointmentDate}</span>
          </div>
          <div className="summary-row">
            <span className="label">Departure</span>
            <span className="value">
              {state.departureTime !== null ? formatTime(state.departureTime) : "—"}
            </span>
          </div>
          <div className="summary-row">
            <span className="label">Est. arrival</span>
            <span className="value">{formatTime(arrival)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Est. completion</span>
            <span className="value">{formatTime(completion)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Travel duration</span>
            <span className="value">{formatDuration(state.travelMinutes)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Service duration</span>
            <span className="value">
              {formatDuration(totals.totalServiceMinutes)}
            </span>
          </div>
          <div className="summary-row">
            <span className="label">Total reserved time</span>
            <span className="value">{formatDuration(reservedMinutes)}</span>
          </div>
        </div>

        <div className="summary-block">
          <h4>Services &amp; payment</h4>
          {state.items.map((it) => (
            <div
              className="summary-row"
              key={`${it.serviceSlug}-${it.variantName ?? ""}`}
            >
              <span className="label">
                {it.serviceName}
                {it.variantName ? ` · ${it.variantName}` : ""}
                {it.quantity > 1 ? ` ×${it.quantity}` : ""}
              </span>
              <span className="value" style={{ textAlign: "right" }}>
                {formatPHP(linePriceOf(it))}
                <br />
                <small style={{ color: "#7a6657", fontWeight: 400 }}>
                  {formatDuration(lineDurationOf(it))}
                </small>
              </span>
            </div>
          ))}
          <div className="summary-row total">
            <span className="label">Services total</span>
            <span className="value">
              {formatPHP(totals.totalServicePrice)}
            </span>
          </div>
          <div className="summary-row gold">
            <span className="label">Reservation fee (due now)</span>
            <span className="value">{formatPHP(totals.reservationFee)}</span>
          </div>
          <div className="summary-row">
            <span className="label">Cash balance at appointment</span>
            <span className="value">{formatPHP(totals.remainingBalance)}</span>
          </div>
        </div>
      </div>

      <div className="policy-box">
        <label>
          <input
            type="checkbox"
            checked={state.acceptedPolicy}
            onChange={(e) => onAcceptPolicy(e.target.checked)}
          />
          <span>
            I understand the reservation fee is non-refundable. The reservation
            fee is deducted from the total service price; the remaining balance
            is paid in cash at the appointment.
          </span>
        </label>
      </div>

      <div className="booking-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={onBack}
          disabled={submitting}
        >
          ← Back
        </button>
        <button
          type="button"
          className="btn btn-gold btn-block"
          onClick={onSubmit}
          disabled={!state.acceptedPolicy || submitting}
        >
          {submitting ? "Securing your slot…" : "Pay reservation fee"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function BookPage() {
  const [state, setState] = useState<BookState>(initialState);
  const [areas, setAreas] = useState<AreaDTO[]>([]);
  const [groups, setGroups] = useState<ServiceGroupDTO[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [reservedMinutes, setReservedMinutes] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/areas")
      .then((r) => r.json())
      .then((data: { areas: AreaDTO[] }) => {
        if (cancelled) return;
        setAreas(data.areas || []);
        setAreasLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAreasLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/services")
      .then((r) => r.json())
      .then((data: { groups: ServiceGroupDTO[] }) => {
        if (cancelled) return;
        setGroups(data.groups || []);
        setGroupsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGroupsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totals = useMemo(() => computeTotals(state.items), [state.items]);
  const serviceMinutes = totals.totalServiceMinutes;

  // ----- mutation helpers -----
  const selectArea = (a: AreaDTO) => {
    setState((s) => ({
      ...s,
      areaId: a.id,
      areaName: a.name,
      travelMinutes: a.travelMinutes,
    }));
  };

  const setHaircutQty = (svc: ServiceDTO, qty: number) => {
    setState((s) => {
      const cleaned = Math.max(0, Math.min(MAX_HAIRCUTS_PER_BOOKING, qty));
      const others = s.items.filter(
        (it) => !(it.serviceSlug === svc.slug && it.unitCategory === "haircut"),
      );
      if (cleaned === 0) return { ...s, items: others };
      const existing = s.items.find(
        (it) => it.serviceSlug === svc.slug && it.unitCategory === "haircut",
      );
      const name = existing?.serviceName ?? svc.name;
      const line: SelectedItem = {
        serviceSlug: svc.slug,
        serviceName: name,
        variantName: null,
        quantity: cleaned,
        unitCategory: "haircut",
        unitPrice: HAIRCUT_BASE_PRICE,
        unitDuration: HAIRCUT_BASE_DURATION,
      };
      return { ...s, items: [...others, line] };
    });
  };

  const addMajor = (svc: ServiceDTO, variantName?: string) => {
    setState((s) => {
      const exists = s.items.some(
        (it) =>
          it.serviceSlug === svc.slug &&
          it.unitCategory === "major" &&
          (it.variantName ?? null) === (variantName ?? null),
      );
      if (exists) return s;
      let unitPrice = svc.basePrice;
      let unitDuration = svc.baseDuration;
      if (variantName) {
        const v = svc.variants.find((x) => x.name === variantName);
        if (!v) return s;
        unitPrice = v.price;
        unitDuration = v.duration;
      }
      const line: SelectedItem = {
        serviceSlug: svc.slug,
        serviceName: svc.name,
        variantName: variantName ?? null,
        quantity: 1,
        unitCategory: "major",
        unitPrice,
        unitDuration,
      };
      return { ...s, items: [...s.items, line] };
    });
  };

  const removeMajor = (svc: ServiceDTO, variantName?: string) => {
    setState((s) => ({
      ...s,
      items: s.items.filter(
        (it) =>
          !(
            it.serviceSlug === svc.slug &&
            it.unitCategory === "major" &&
            (it.variantName ?? null) === (variantName ?? null)
          ),
      ),
    }));
  };

  const updateCustomer = (c: CustomerInfo) => {
    setState((s) => ({ ...s, customer: c }));
  };
  const updateDate = (d: string) => {
    setState((s) => ({ ...s, appointmentDate: d, departureTime: null }));
  };
  const updateDeparture = (m: number | null) => {
    setState((s) => ({ ...s, departureTime: m }));
  };
  const acceptPolicy = (v: boolean) => {
    setState((s) => ({ ...s, acceptedPolicy: v }));
  };

  const goToStep = (n: 1 | 2 | 3 | 4) => {
    setState((s) => ({ ...s, step: n }));
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          areaId: state.areaId,
          items: state.items.map((it) => ({
            serviceSlug: it.serviceSlug,
            variantName: it.variantName,
            quantity: it.quantity,
          })),
          customer: state.customer,
          appointmentDate: state.appointmentDate,
          departureTime: state.departureTime,
          acceptedPolicy: state.acceptedPolicy,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        toast.error(data.error || "Booking could not be created.");
        setSubmitting(false);
        return;
      }
      // Success — redirect to checkout (real PayRex or mock checkout).
      window.location.href = data.checkoutUrl;
    } catch {
      toast.error("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="booking-shell">
        <div className="booking-wrap">
          <Stepper current={state.step} />

          {state.step === 1 && (
            <StepArea
              areas={areas}
              loading={areasLoading}
              selectedId={state.areaId}
              onSelect={(a) => {
                selectArea(a);
                // auto-advance after a short beat so the user sees the
                // selected state register before the step changes
                setTimeout(() => goToStep(2), 120);
              }}
              onContinue={() => goToStep(2)}
            />
          )}

          {state.step === 2 && (
            <StepServices
              groups={groups}
              loading={groupsLoading}
              items={state.items}
              onAddMajor={addMajor}
              onRemoveMajor={removeMajor}
              onSetHaircutQty={setHaircutQty}
              onBack={() => goToStep(1)}
              onContinue={() => goToStep(3)}
            />
          )}

          {state.step === 3 && (
            <StepDetails
              customer={state.customer}
              onCustomerChange={updateCustomer}
              appointmentDate={state.appointmentDate}
              onDateChange={updateDate}
              travelMinutes={state.travelMinutes}
              serviceMinutes={serviceMinutes}
              departureTime={state.departureTime}
              onDepartureChange={updateDeparture}
              onReservedMinutes={setReservedMinutes}
              onBack={() => goToStep(2)}
              onContinue={() => goToStep(4)}
            />
          )}

          {state.step === 4 && (
            <StepReview
              state={state}
              totals={totals}
              reservedMinutes={
                reservedMinutes ||
                Math.ceil((serviceMinutes + state.travelMinutes) / 60) * 60
              }
              onAcceptPolicy={acceptPolicy}
              onBack={() => goToStep(3)}
              onSubmit={submit}
              submitting={submitting}
            />
          )}
        </div>
      </div>
    </AppShell>
  );
}
