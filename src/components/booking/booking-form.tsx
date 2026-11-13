'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HAIRCUT_GROUPS,
  MAX_HAIRCUTS,
  MAX_MAJORS_ONLY,
  MAJOR_CATEGORIES,
  MAJOR_SERVICES,
  SERVICE_AREAS,
  findMajorService,
  findVariant,
} from '@/lib/catalogue';
import {
  calculateDuration,
  calculatePricing,
  formatCurrency,
  getManilaDateTime,
  getServiceArea,
  serviceHours,
  validateCombination,
  type MajorSelection,
} from '@/lib/booking';
import { SLOT_LOCK_MINUTES } from '@/lib/catalogue';
import './booking.css';

interface SlotInfo {
  hour: number;
  label: string;
  arrivalLabel: string;
  completionLabel: string;
  available: boolean;
  reason?: string;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: { n: Step; label: string }[] = [
  { n: 1, label: 'Services' },
  { n: 2, label: 'Area' },
  { n: 3, label: 'Details' },
  { n: 4, label: 'Schedule' },
  { n: 5, label: 'Review' },
];

export function BookingForm() {
  const [step, setStep] = useState<Step>(1);

  const [haircutTypes, setHaircutTypes] = useState<string[]>([]);
  const haircutQty = haircutTypes.length;
  const [majors, setMajors] = useState<MajorSelection[]>([]);
  const [areaId, setAreaId] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [address, setAddress] = useState('');
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [date, setDate] = useState('');
  const [slots, setSlots] = useState<SlotInfo[]>([]);
  const [departureHour, setDepartureHour] = useState<number | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const selection = useMemo(
    () => ({ haircutQuantity: haircutQty, majorSelections: majors, serviceAreaId: areaId }),
    [haircutQty, majors, areaId],
  );

  const combo = useMemo(
    () => validateCombination(haircutQty, majors.length),
    [haircutQty, majors.length],
  );
  const pricing = useMemo(() => calculatePricing(selection), [selection]);
  const duration = useMemo(() => calculateDuration(selection), [selection]);
  const svcHours = useMemo(() => serviceHours(selection), [selection]);
  const area = areaId ? getServiceArea(areaId) : undefined;

  useEffect(() => {
    if (step !== 4 || !date || !combo.valid) return;
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError('');
    setSlots([]);
    setDepartureHour(null);
    fetch('/api/bookings/availability', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection, date }),
    })
      .then(async (r) => {
        if (cancelled) return;
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setAvailabilityError(data.error || 'Could not load availability.');
          return;
        }
        setSlots(data.slots ?? []);
        setAvailabilityError('');
      })
      .catch(() => {
        if (!cancelled) setAvailabilityError('Network error loading availability.');
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step, date, haircutQty, majors, areaId]);

  function addHaircutType(t: string) {
    if (!canAddHaircut(haircutQty, majors.length)) return;
    setHaircutTypes((prev) => [...prev, t]);
  }

  function removeHaircutType(t: string) {
    setHaircutTypes((prev) => {
      const index = prev.lastIndexOf(t);
      return index < 0 ? prev : prev.filter((_, i) => i !== index);
    });
  }

  function addMajor(serviceId: string, variantId: string) {
    if (!canAddMajor(haircutQty, majors.length)) return;
    setMajors((prev) => [...prev, { serviceId, variantId }]);
  }

  function removeMajor(serviceId: string, variantId: string) {
    setMajors((prev) => {
      const index = prev.findIndex((m) => m.serviceId === serviceId && m.variantId === variantId);
      return index < 0 ? prev : prev.filter((_, i) => i !== index);
    });
  }

  function validateContact(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Required';
    if (!email.trim()) errs.email = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Invalid email';
    if (!mobile.trim()) errs.mobile = 'Required';
    else {
      const d = mobile.replace(/[^\d]/g, '');
      if (d.length < 7) errs.mobile = 'Too short';
    }
    if (!address.trim()) errs.address = 'Required';
    return errs;
  }

  // Pure check (no setState) — used to enable/disable the Continue button.
  function canAdvance(): boolean {
    if (step === 1) return combo.valid;
    if (step === 2) return Boolean(areaId);
    if (step === 3) return Object.keys(validateContact()).length === 0;
    if (step === 4) return departureHour !== null;
    return true;
  }

  function next() {
    if (step === 3) {
      const errs = validateContact();
      setContactErrors(errs);
      if (Object.keys(errs).length > 0) return;
    }
    if (!canAdvance()) return;
    if (step < 5) setStep((s) => (s + 1) as Step);
  }
  function back() {
    if (step > 1) setStep((s) => (s - 1) as Step);
  }

  async function submit() {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          haircutQuantity: haircutQty,
          haircutTypeNotes: haircutTypes.join(', '),
          majorSelections: majors,
          serviceAreaId: areaId,
          customerName: name,
          customerEmail: email,
          customerMobile: mobile,
          serviceAddress: address,
          appointmentDate: date,
          departureHour,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.checkoutUrl) {
        setSubmitError(data.error || 'Booking failed. Please try again.');
        setSubmitting(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setSubmitError('Network error. Please try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="book-wrap">
      <div>
        <Stepper step={step} />
        {step === 1 && (
          <StepServices
            haircutQty={haircutQty}
            haircutTypes={haircutTypes}
            majors={majors}
            combo={combo}
            onAddHaircut={addHaircutType}
            onRemoveHaircut={removeHaircutType}
            onAddMajor={addMajor}
            onRemoveMajor={removeMajor}
          />
        )}
        {step === 2 && <StepArea areaId={areaId} onPick={setAreaId} />}
        {step === 3 && (
          <StepContact
            name={name}
            email={email}
            mobile={mobile}
            address={address}
            errors={contactErrors}
            onName={setName}
            onEmail={setEmail}
            onMobile={setMobile}
            onAddress={setAddress}
          />
        )}
        {step === 4 && (
          <StepSchedule
            date={date}
            onDate={setDate}
            slots={slots}
            loading={availabilityLoading}
            error={availabilityError}
            departureHour={departureHour}
            onPick={setDepartureHour}
            areaLabel={area?.label}
            travelHours={duration.travelHours}
          />
        )}
        {step === 5 && (
          <StepReview
            haircutQty={haircutQty}
            haircutTypes={haircutTypes}
            majors={majors}
            area={area}
            name={name}
            email={email}
            mobile={mobile}
            address={address}
            date={date}
            departureHour={departureHour}
            duration={duration}
            pricing={pricing}
            submitting={submitting}
            submitError={submitError}
            onSubmit={submit}
          />
        )}

        {step < 5 && (
          <div className="book-actions">
            <button className="btn btn-ghost" onClick={back} disabled={step === 1}>← Back</button>
            <button className="btn btn-primary" onClick={next} disabled={!canAdvance()}>
              {step === 4 ? 'Review booking' : 'Continue'} →
            </button>
          </div>
        )}
      </div>

      <Summary
        haircutQty={haircutQty}
        haircutTypes={haircutTypes}
        majors={majors}
        pricing={pricing}
        duration={duration}
        svcHours={svcHours}
        area={area}
        comboValid={combo.valid}
      />
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="book-steps">
      {STEP_LABELS.map((s, i) => (
        <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={`book-step ${step === s.n ? 'active' : ''} ${step > s.n ? 'done' : ''}`}>
            <span className="num">{step > s.n ? '✓' : s.n}</span>
            <span>{s.label}</span>
          </div>
          {i < STEP_LABELS.length - 1 && <span className="book-step-sep" />}
        </div>
      ))}
    </div>
  );
}

function StepServices({
  haircutQty,
  haircutTypes,
  majors,
  combo,
  onAddHaircut,
  onRemoveHaircut,
  onAddMajor,
  onRemoveMajor,
}: {
  haircutQty: number;
  haircutTypes: string[];
  majors: MajorSelection[];
  combo: ReturnType<typeof validateCombination>;
  onAddHaircut: (type: string) => void;
  onRemoveHaircut: (type: string) => void;
  onAddMajor: (serviceId: string, variantId: string) => void;
  onRemoveMajor: (serviceId: string, variantId: string) => void;
}) {
  const [openCategory, setOpenCategory] = useState(
    HAIRCUT_GROUPS[0]?.heading ??
      '',
  );
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);

  return (
    <div className="book-card">
      <h2 className="book-section-title">Choose your services</h2>
      <p className="book-section-sub">
        Add services to your booking. You can choose up to {MAX_HAIRCUTS} haircuts, or 1 haircut + 1 major service,
        or up to {MAX_MAJORS_ONLY} major services alone. The same service can be added more than once.
      </p>

      <div className={`combo-note ${combo.valid ? '' : 'error'}`}>
        {combo.valid ? (
          <>
            <b>Allowed combination.</b> {describeCombo(haircutQty, majors.length)}
          </>
        ) : (
          <b>{combo.reason}</b>
        )}
      </div>

      <h3 style={sectionH3}>Haircuts {haircutQty > 0 && <span style={muted}>· {haircutQty} selected</span>}</h3>
      {HAIRCUT_GROUPS.map((group) => {
        const categoryOpen = openCategory === group.heading;
        const categorySelected = haircutTypes.filter((type) => group.services.includes(type)).length;
        return (
          <section className={`major-category ${categoryOpen ? 'open' : ''}`} key={group.heading}>
            <button
              className="major-category-toggle"
              type="button"
              aria-expanded={categoryOpen}
              onClick={() => setOpenCategory((current) => current === group.heading ? '' : group.heading)}
            >
              <span className="major-category-title">{group.heading}</span>
              <span className="major-category-count">
                {categorySelected > 0 ? `${categorySelected} selected` : `${group.services.length} styles`}
              </span>
              <span className="major-category-chevron" aria-hidden="true">⌄</span>
            </button>
            {categoryOpen && (
              <div className="major-group haircut-group">
                {group.services.map((type) => {
                  const count = haircutTypes.filter((selectedType) => selectedType === type).length;
                  const disabled = count === 0 && !canAddHaircut(haircutQty, majors.length);
                  return (
                    <div className={`haircut-item ${count ? 'selected' : ''}`} key={type}>
                      <button
                        className="haircut-item-add"
                        type="button"
                        disabled={disabled}
                        onClick={() => onAddHaircut(type)}
                      >
                        <span className="major-item-name">{type}</span>
                        <span className="haircut-item-price">
                          {haircutQty === 0 ? '₱999 first · ₱500 each after' : '₱500 additional'}
                        </span>
                        <span className="major-item-action">{count ? 'Add another' : 'Add haircut'}</span>
                      </button>
                      {count > 0 && (
                        <div className="haircut-item-count">
                          <button
                            type="button"
                            className="selection-stepper"
                            aria-label={`Remove one ${type}`}
                            onClick={() => onRemoveHaircut(type)}
                          >
                            −
                          </button>
                          <span>{count}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div>
        <h3 style={{ ...sectionH3, marginTop: 24 }}>
          Major services {majors.length > 0 && <span style={muted}>· {majors.length} selected</span>}
        </h3>
        {MAJOR_CATEGORIES.map((cat) => (
          <section className={`major-category ${openCategory === cat.title ? 'open' : ''}`} key={cat.title}>
            <button
              className="major-category-toggle"
              type="button"
              aria-expanded={openCategory === cat.title}
              onClick={() => setOpenCategory((current) => current === cat.title ? '' : cat.title)}
            >
              <span className="major-category-title">{cat.title}</span>
              <span className="major-category-count">
                {cat.services.length} {cat.services.length === 1 ? 'service' : 'services'}
              </span>
              <span className="major-category-chevron" aria-hidden="true">⌄</span>
            </button>
            {openCategory === cat.title && (
              <div className="major-group">
                {cat.services.map((serviceName) => {
                  const service = MAJOR_SERVICES.find((s) => s.name === serviceName);
                  if (!service) return null;
                  const serviceSelections = majors.filter((m) => m.serviceId === service.id);
                  const selectedCount = serviceSelections.length;
                  const hasVariants = service.variants.length > 1;
                  const expanded = expandedServiceId === service.id;
                  return (
                    <div className={`major-item ${selectedCount ? 'selected' : ''}`} key={service.id}>
                      <div className="major-item-head">
                        <button
                          className="major-item-select"
                          type="button"
                          aria-expanded={hasVariants ? expanded : undefined}
                          disabled={!hasVariants && !canAddMajor(haircutQty, majors.length)}
                          onClick={() => {
                            if (hasVariants) {
                              setExpandedServiceId((current) => current === service.id ? null : service.id);
                            } else if (canAddMajor(haircutQty, majors.length)) {
                              onAddMajor(service.id, service.variants[0].id);
                            }
                          }}
                        >
                          <span className="major-item-copy">
                            <span className="major-item-name">{service.name}</span>
                            <span className="price-from">
                              {hasVariants
                                ? `From ${formatCurrency(Math.min(...service.variants.map((v) => v.price)))}`
                                : `${formatCurrency(service.variants[0].price)} · ${service.variants[0].durationHours}h`}
                            </span>
                          </span>
                          <span className={`major-item-action ${!canAddMajor(haircutQty, majors.length) ? 'disabled' : ''}`}>
                            {hasVariants
                              ? (expanded ? 'Choose options' : 'Choose size')
                              : !canAddMajor(haircutQty, majors.length)
                                ? 'At limit'
                                : selectedCount
                                  ? 'Add another'
                                  : 'Add'}
                          </span>
                        </button>
                        {selectedCount > 0 && (
                          <span className="major-item-count">{selectedCount} in booking</span>
                        )}
                      </div>
                      {hasVariants && expanded && (
                        <div className="variant-list">
                          {service.variants.map((v) => {
                            const count = serviceSelections.filter((m) => m.variantId === v.id).length;
                            const variantDisabled = !canAddMajor(haircutQty, majors.length);
                            return (
                              <div className="variant-choice" key={v.id}>
                                <button
                                  className={`variant-opt ${count ? 'selected' : ''}`}
                                  disabled={variantDisabled}
                                  onClick={() => onAddMajor(service.id, v.id)}
                                >
                                  <span className="v-label">{v.label}</span>
                                  <span className="v-dur">{v.durationHours}h</span>
                                  <span className="v-price">{formatCurrency(v.price)}</span>
                                  {count > 0 && <span className="variant-count">×{count}</span>}
                                </button>
                                {count > 0 && (
                                  <button
                                    type="button"
                                    className="selection-stepper"
                                    aria-label={`Remove one ${service.name} ${v.label}`}
                                    onClick={() => onRemoveMajor(service.id, v.id)}
                                  >
                                    −
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!hasVariants && selectedCount > 0 && (
                        <div className="major-item-remove">
                          <button
                            type="button"
                            className="selection-stepper"
                            aria-label={`Remove one ${service.name}`}
                            onClick={() => onRemoveMajor(service.id, service.variants[0].id)}
                          >
                            −
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function canAddHaircut(qty: number, majorCount: number): boolean {
  if (majorCount === 0) return qty < MAX_HAIRCUTS;
  if (majorCount === 1 && qty === 0) return true;
  return false;
}
function canAddMajor(qty: number, majorCount: number): boolean {
  if (qty === 0) return majorCount < MAX_MAJORS_ONLY;
  if (qty === 1 && majorCount === 0) return true;
  return false;
}
function describeCombo(qty: number, majorCount: number): string {
  if (qty > 0 && majorCount === 0) return `${qty} haircut(s), ${qty} hour(s).`;
  if (qty === 1 && majorCount === 1) return `1 haircut + 1 major service.`;
  if (qty === 0 && majorCount > 0) return `${majorCount} major service(s).`;
  return '';
}

function groupHaircutTypes(types: string[]) {
  return types.reduce<{ type: string; quantity: number }[]>((groups, type) => {
    const group = groups.find((item) => item.type === type);
    if (group) group.quantity += 1;
    else groups.push({ type, quantity: 1 });
    return groups;
  }, []);
}

function groupMajorSelections(selections: MajorSelection[]) {
  return selections.reduce<{ serviceId: string; variantId: string; quantity: number }[]>((groups, selection) => {
    const group = groups.find(
      (item) => item.serviceId === selection.serviceId && item.variantId === selection.variantId,
    );
    if (group) group.quantity += 1;
    else groups.push({ ...selection, quantity: 1 });
    return groups;
  }, []);
}

function StepArea({ areaId, onPick }: { areaId: string; onPick: (id: string) => void }) {
  return (
    <div className="book-card">
      <h2 className="book-section-title">Select your service area</h2>
      <p className="book-section-sub">
        JESS travels from her base in Batasan Hills, Quezon City. Travel time is added to each
        appointment and affects the total reserved time.
      </p>
      <div className="area-grid">
        {SERVICE_AREAS.map((a) => (
          <button key={a.id} className={`area-opt ${areaId === a.id ? 'selected' : ''}`} onClick={() => onPick(a.id)}>
            <b>{a.label}</b>
            <small>One-way travel</small>
            <span className="travel">{a.travelHours} hour{a.travelHours > 1 ? 's' : ''}</span>
          </button>
        ))}
      </div>
      <p className="slot-note" style={{ marginTop: 16 }}>
        The time you pick in the next step is when JESS leaves her base — not her arrival time at
        your address.
      </p>
    </div>
  );
}

function StepContact(props: {
  name: string; email: string; mobile: string; address: string;
  errors: Record<string, string>;
  onName: (v: string) => void; onEmail: (v: string) => void; onMobile: (v: string) => void; onAddress: (v: string) => void;
}) {
  return (
    <div className="book-card">
      <h2 className="book-section-title">Your details</h2>
      <p className="book-section-sub">No account needed. We’ll use these details to confirm your appointment.</p>
      <div className="field">
        <label>Full name</label>
        <input value={props.name} onChange={(e) => props.onName(e.target.value)} placeholder="Juan dela Cruz" />
        {props.errors.name && <div className="err">{props.errors.name}</div>}
      </div>
      <div className="field">
        <label>Email address</label>
        <input type="email" value={props.email} onChange={(e) => props.onEmail(e.target.value)} placeholder="you@email.com" />
        {props.errors.email && <div className="err">{props.errors.email}</div>}
      </div>
      <div className="field">
        <label>Mobile number</label>
        <input value={props.mobile} onChange={(e) => props.onMobile(e.target.value)} placeholder="+63 9xx xxx xxxx" />
        {props.errors.mobile && <div className="err">{props.errors.mobile}</div>}
      </div>
      <div className="field">
        <label>Complete service address</label>
        <textarea value={props.address} onChange={(e) => props.onAddress(e.target.value)} rows={3} placeholder="House no., street, barangay, city" />
        {props.errors.address && <div className="err">{props.errors.address}</div>}
      </div>
    </div>
  );
}

function StepSchedule(props: {
  date: string; onDate: (d: string) => void; slots: SlotInfo[]; loading: boolean;
  error: string; departureHour: number | null; onPick: (h: number) => void;
  areaLabel?: string; travelHours: number;
}) {
  const today = getManilaDateTime().date;
  return (
    <div className="book-card">
      <h2 className="book-section-title">Pick a date &amp; time</h2>
      <p className="book-section-sub">
        JESS works daily, 8:00 AM – 6:00 PM. The time you choose is her departure time from
        {props.areaLabel ? ` ${props.areaLabel}` : ' base'} ({props.travelHours}h travel).
      </p>
      <div className="date-row">
        <div className="field">
          <label>Appointment date</label>
          <input type="date" min={today} value={props.date} onChange={(e) => props.onDate(e.target.value)} />
        </div>
      </div>
      {!props.date && <p className="slot-note">Select a date to see available departure times.</p>}
      {props.loading && <p className="slot-note">Checking availability…</p>}
      {props.error && <p className="slot-note" style={{ color: '#a33' }}>{props.error}</p>}
      {props.slots.length > 0 && (
        <>
          <div className="slot-grid">
            {props.slots.map((s) => (
              <button
                key={s.hour}
                className={`slot ${props.departureHour === s.hour ? 'selected' : ''}`}
                disabled={!s.available}
                onClick={() => props.onPick(s.hour)}
                title={s.reason}
              >
                <div className="t">{s.label}</div>
                <div className="est">Arrive {s.arrivalLabel}</div>
                <div className="est">Done {s.completionLabel}</div>
              </button>
            ))}
          </div>
          <p className="slot-note">
            Estimated arrival includes travel time. A slot is held for {SLOT_LOCK_MINUTES} minutes during checkout.
          </p>
        </>
      )}
    </div>
  );
}

function StepReview(props: {
  haircutQty: number; haircutTypes: string[]; majors: MajorSelection[];
  area?: { label: string; travelHours: number };
  name: string; email: string; mobile: string; address: string;
  date: string; departureHour: number | null;
  duration: ReturnType<typeof calculateDuration>;
  pricing: ReturnType<typeof calculatePricing>;
  submitting: boolean; submitError: string; onSubmit: () => void;
}) {
  return (
    <div className="book-card">
      <h2 className="book-section-title">Review &amp; pay</h2>
      <p className="book-section-sub">
        Confirm your booking, then pay the reservation fee through PayRex secure checkout. Your
        slot is held for {SLOT_LOCK_MINUTES} minutes during payment.
      </p>
      <div className="ac-grid">
        <div className="row"><span className="k">Name</span><span className="v">{props.name}</span></div>
        <div className="row"><span className="k">Email</span><span className="v">{props.email}</span></div>
        <div className="row"><span className="k">Mobile</span><span className="v">{props.mobile}</span></div>
        <div className="row"><span className="k">Area</span><span className="v">{props.area?.label}</span></div>
        <div className="row"><span className="k">Date</span><span className="v">{props.date}</span></div>
        <div className="row"><span className="k">Departure</span><span className="v">{props.departureHour}:00</span></div>
        <div className="row" style={{ gridColumn: '1 / -1' }}><span className="k">Address</span><span className="v" style={{ textAlign: 'right' }}>{props.address}</span></div>
      </div>
      <div className="ac-services">
        <h6>Selected services</h6>
        {groupHaircutTypes(props.haircutTypes).map(({ type, quantity }) => (
          <div className="svc" key={type}>
            <b>{quantity > 1 ? `${quantity} × ` : ''}{type}</b>
            <small>Haircut</small>
          </div>
        ))}
        {props.haircutQty > 0 && props.haircutTypes.length === 0 && (
          <div className="svc"><b>{props.haircutQty} haircut(s)</b></div>
        )}
        {groupMajorSelections(props.majors).map((m) => {
          const svc = findMajorService(m.serviceId);
          const v = svc ? findVariant(svc, m.variantId) : undefined;
          return (
            <div className="svc" key={`${m.serviceId}-${m.variantId}`}>
              <b>{m.quantity > 1 ? `${m.quantity} × ` : ''}{svc?.name}</b>
              {v && <small> · {v.label} · {formatCurrency(v.price)} · {v.durationHours}h</small>}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16, padding: 14, background: '#fbf6e9', border: '1px solid rgba(212,181,104,.4)' }}>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span className="k">Total service price</span><span className="v" style={{ fontWeight: 600 }}>{formatCurrency(props.pricing.totalPrice)}</span>
        </div>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span className="k">Reservation fee (pay now)</span><span className="v" style={{ fontWeight: 700, color: '#9e7831' }}>{formatCurrency(props.pricing.reservationFee)}</span>
        </div>
        <div className="row" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
          <span className="k">Remaining (cash on appointment)</span><span className="v" style={{ fontWeight: 600 }}>{formatCurrency(props.pricing.remainingBalance)}</span>
        </div>
      </div>
      <p className="slot-note" style={{ marginTop: 14 }}>
        The reservation fee is <b>non-refundable</b> and is deducted from your total. The remaining
        balance is paid in cash during the appointment.
      </p>
      {props.submitError && <div className="combo-note error" style={{ marginTop: 14 }}>{props.submitError}</div>}
      <div className="book-actions" style={{ marginTop: 22 }}>
        <button className="btn btn-ghost" onClick={() => window.history.back()} disabled={props.submitting}>← Back</button>
        <button className="btn btn-primary" onClick={props.onSubmit} disabled={props.submitting}>
          {props.submitting ? 'Redirecting to PayRex…' : `Pay ${formatCurrency(props.pricing.reservationFee)} reservation`}
        </button>
      </div>
    </div>
  );
}

function Summary({
  haircutQty, haircutTypes, majors, pricing, duration, svcHours, area, comboValid,
}: {
  haircutQty: number; haircutTypes: string[]; majors: MajorSelection[];
  pricing: ReturnType<typeof calculatePricing>;
  duration: ReturnType<typeof calculateDuration>;
  svcHours: number;
  area?: { label: string; travelHours: number };
  comboValid: boolean;
}) {
  const hasItems = haircutQty > 0 || majors.length > 0;
  return (
    <div className="summary">
      <div className="summary-card">
        <p className="eyebrow">YOUR BOOKING</p>
        <h3>Summary</h3>
        {!hasItems && <p className="summary-empty">Select services to see your estimate.</p>}
        {hasItems && (
          <>
            {groupHaircutTypes(haircutTypes).map(({ type, quantity }) => (
              <div className="summary-service" key={type}>
                <b>{quantity > 1 ? `${quantity} × ` : ''}{type}</b>
                <small>Haircut</small>
              </div>
            ))}
            {haircutQty > 0 && haircutTypes.length === 0 && (
              <div className="summary-service"><b>{haircutQty} haircut(s)</b></div>
            )}
            {groupMajorSelections(majors).map((m) => {
              const svc = findMajorService(m.serviceId);
              const v = svc ? findVariant(svc, m.variantId) : undefined;
              return (
                <div className="summary-service" key={`${m.serviceId}-${m.variantId}`}>
                  <b>{m.quantity > 1 ? `${m.quantity} × ` : ''}{svc?.name}</b>
                  {v && <small>{v.label} · {formatCurrency(v.price)}</small>}
                </div>
              );
            })}
          </>
        )}
        <div className="summary-totals">
          <div className="summary-line"><span className="k">Service time</span><span className="v">{svcHours}h</span></div>
          <div className="summary-line"><span className="k">Travel time</span><span className="v">{duration.travelHours}h</span></div>
          <div className="summary-line"><span className="k">Reserved block</span><span className="v">{duration.committedHours}h</span></div>
          <div className="summary-line"><span className="k">Area</span><span className="v">{area?.label ?? '—'}</span></div>
          <div className="summary-line"><span className="k">Total price</span><span className="v">{formatCurrency(pricing.totalPrice)}</span></div>
          <div className="summary-line reservation"><span className="k">Reservation fee</span><span className="v">{formatCurrency(pricing.reservationFee)}</span></div>
          <div className="summary-line balance"><span className="k">Balance (cash)</span><span className="v">{formatCurrency(pricing.remainingBalance)}</span></div>
        </div>
        {!comboValid && hasItems && (
          <p className="slot-note" style={{ color: '#d8a46a', marginTop: 12 }}>Adjust your selection to meet the allowed combinations.</p>
        )}
      </div>
    </div>
  );
}

const sectionH3: React.CSSProperties = { font: '500 18px "Playfair Display", serif', margin: '0 0 12px', color: '#191817' };
const muted: React.CSSProperties = { color: '#9e7831', fontSize: 12, fontWeight: 400 };
const mutedSmall: React.CSSProperties = { color: '#7c6f60', fontSize: 11, margin: '0 0 10px' };
