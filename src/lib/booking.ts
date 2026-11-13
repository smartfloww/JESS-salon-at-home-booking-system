/**
 * JESS Salon at Home — Booking business logic
 *
 * Pure, reusable functions for the booking flow. Used by BOTH the
 * frontend (live preview) and the backend (authoritative validation).
 * The backend always re-runs these — the browser is never trusted for
 * prices, durations, combination validity, or scheduling.
 *
 * All time math uses integer minutes from midnight to avoid float errors.
 */

import {
  HAIRCUT_ADDITIONAL_PERSON_PRICE,
  HAIRCUT_FIRST_PERSON_PRICE,
  HAIRCUT_HOURS_PER_PERSON,
  MAX_HAIRCUTS,
  MAX_MAJORS_ONLY,
  RESERVATION_FEE_HAIRCUT,
  RESERVATION_FEE_MAJOR,
  SERVICE_AREAS,
  WORKING_END_HOUR,
  WORKING_START_HOUR,
  findMajorService,
  findVariant,
  type ServiceArea,
} from './catalogue';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface MajorSelection {
  serviceId: string;
  variantId: string;
}

export interface BookingSelection {
  haircutQuantity: number; // 0..5
  haircutTypeNotes?: string;
  majorSelections: MajorSelection[]; // 0..2
  serviceAreaId: string;
}

export interface PriceBreakdown {
  haircutTotal: number;
  majorTotal: number;
  totalPrice: number;
  reservationFee: number;
  remainingBalance: number;
}

export interface DurationBreakdown {
  serviceHours: number;
  travelHours: number;
  /** Service + travel, rounded UP to the next full hour. */
  committedHours: number;
}

export interface TimeBlock {
  /** Minutes from midnight. */
  startMin: number;
  endMin: number;
}

export interface DepartureSlot {
  hour: number; // 8..18
  startMin: number;
  arrivalMin: number;
  completionMin: number;
  available: boolean;
  /** Reason if unavailable. */
  reason?: string;
}

/* ------------------------------------------------------------------ */
/* Combination rules                                                   */
/* ------------------------------------------------------------------ */

export interface CombinationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Allowed booking combinations:
 *   1. Up to 5 haircuts alone.
 *   2. 1 haircut + 1 major service.
 *   3. 1 or 2 major services alone.
 */
export function validateCombination(
  haircutQuantity: number,
  majorCount: number,
): CombinationResult {
  if (haircutQuantity < 0 || majorCount < 0) {
    return { valid: false, reason: 'Invalid selection.' };
  }
  if (haircutQuantity === 0 && majorCount === 0) {
    return { valid: false, reason: 'Select at least one service.' };
  }

  // Case 1: haircuts only (1-5)
  if (majorCount === 0) {
    if (haircutQuantity > MAX_HAIRCUTS) {
      return {
        valid: false,
        reason: `A single booking allows up to ${MAX_HAIRCUTS} haircuts. For larger groups (20–30 people), please contact JESS directly.`,
      };
    }
    return { valid: true };
  }

  // Case 2: 1 haircut + 1 major service
  if (haircutQuantity === 1 && majorCount === 1) {
    return { valid: true };
  }

  // Case 3: 1 or 2 major services alone
  if (haircutQuantity === 0 && majorCount <= MAX_MAJORS_ONLY) {
    return { valid: true };
  }

  // Everything else is invalid
  if (haircutQuantity >= 1 && majorCount >= 1) {
    return {
      valid: false,
      reason:
        majorCount > 1
          ? 'You can combine at most 1 haircut with 1 major service. Please reduce your selection.'
          : 'You can combine 1 haircut with 1 major service, or remove the haircut to book major services alone.',
    };
  }
  if (haircutQuantity === 0 && majorCount > MAX_MAJORS_ONLY) {
    return {
      valid: false,
      reason: `A single booking allows up to ${MAX_MAJORS_ONLY} major services.`,
    };
  }
  if (haircutQuantity > MAX_HAIRCUTS && majorCount === 0) {
    return {
      valid: false,
      reason: `A single booking allows up to ${MAX_HAIRCUTS} haircuts.`,
    };
  }
  return { valid: false, reason: 'This service combination is not allowed.' };
}

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

/** Haircut total: first person ₱999, each additional +₱500. */
export function haircutTotal(quantity: number): number {
  if (quantity <= 0) return 0;
  return HAIRCUT_FIRST_PERSON_PRICE + HAIRCUT_ADDITIONAL_PERSON_PRICE * (quantity - 1);
}

/** Sum of selected major-service variant prices. */
export function majorTotal(selections: MajorSelection[]): number {
  return selections.reduce((sum, sel) => {
    const service = findMajorService(sel.serviceId);
    if (!service) return sum;
    const variant = findVariant(service, sel.variantId);
    if (!variant) return sum;
    return sum + variant.price;
  }, 0);
}

function majorReservationFee(selections: MajorSelection[]): number {
  return selections.reduce((sum, sel) => {
    const service = findMajorService(sel.serviceId);
    if (!service) return sum;
    const variant = findVariant(service, sel.variantId);
    if (!variant) return sum;
    const fee =
      variant.price < RESERVATION_FEE_MAJOR
        ? RESERVATION_FEE_HAIRCUT
        : RESERVATION_FEE_MAJOR;
    return sum + fee;
  }, 0);
}

export function calculatePricing(selection: BookingSelection): PriceBreakdown {
  const haircutQty = selection.haircutQuantity;

  const haircutSub = haircutTotal(haircutQty);
  const majorSub = majorTotal(selection.majorSelections);
  const totalPrice = haircutSub + majorSub;
  const reservationFee =
    RESERVATION_FEE_HAIRCUT * haircutQty + majorReservationFee(selection.majorSelections);
  const remainingBalance = Math.max(0, totalPrice - reservationFee);

  return {
    haircutTotal: haircutSub,
    majorTotal: majorSub,
    totalPrice,
    reservationFee,
    remainingBalance,
  };
}

/* ------------------------------------------------------------------ */
/* Duration & scheduling                                               */
/* ------------------------------------------------------------------ */

export function getServiceArea(id: string): ServiceArea | undefined {
  return SERVICE_AREAS.find((a) => a.id === id);
}

/** Total service duration in hours for the selection. */
export function serviceHours(selection: BookingSelection): number {
  const haircut = selection.haircutQuantity * HAIRCUT_HOURS_PER_PERSON;
  const major = selection.majorSelections.reduce((sum, sel) => {
    const service = findMajorService(sel.serviceId);
    if (!service) return sum;
    const variant = findVariant(service, sel.variantId);
    if (!variant) return sum;
    return sum + variant.durationHours;
  }, 0);
  return haircut + major;
}

/** Round a number of hours UP to the next whole hour. */
export function roundUpToHour(hours: number): number {
  return Math.ceil(hours);
}

export function calculateDuration(selection: BookingSelection): DurationBreakdown {
  const svc = serviceHours(selection);
  const area = getServiceArea(selection.serviceAreaId);
  const travel = area ? area.travelHours : 0;
  const committed = roundUpToHour(svc + travel);
  return { serviceHours: svc, travelHours: travel, committedHours: committed };
}

const MIN_PER_HOUR = 60;
const WORKING_START_MIN = WORKING_START_HOUR * MIN_PER_HOUR; // 480
const WORKING_END_MIN = WORKING_END_HOUR * MIN_PER_HOUR; // 1080

/**
 * Available departure slots for a given date.
 *
 * Rules:
 *   - Departure times are on fixed one-hour intervals from 8:00.
 *   - The entire committed block (departure → departure + committedHours)
 *     must fit within 8:00–18:00.
 *   - Must not overlap any existing reserved time block.
 *   - For today, past times are excluded.
 *
 * `travelHours` is used to compute the estimated arrival time for each slot.
 */
export function getDepartureSlots(
  committedHours: number,
  travelHours: number,
  dateISO: string,
  existingBlocks: TimeBlock[],
  now: Date = new Date(),
): DepartureSlot[] {
  const committedMin = committedHours * MIN_PER_HOUR;
  const travelMin = Math.round(travelHours * MIN_PER_HOUR);
  const latestDepartureMin = WORKING_END_MIN - committedMin;

  const slots: DepartureSlot[] = [];
  const { date: todayISO, minutes: nowMin } = getManilaDateTime(now);
  const isToday = dateISO === todayISO;

  for (let dep = WORKING_START_MIN; dep <= latestDepartureMin; dep += MIN_PER_HOUR) {
    const block: TimeBlock = { startMin: dep, endMin: dep + committedMin };

    let available = true;
    let reason: string | undefined;

    if (isToday && dep <= nowMin) {
      available = false;
      reason = 'Past time';
    } else if (overlapsAny(block, existingBlocks)) {
      available = false;
      reason = 'Already booked';
    }

    slots.push({
      hour: dep / MIN_PER_HOUR,
      startMin: dep,
      arrivalMin: dep + travelMin,
      completionMin: dep + committedMin,
      available,
      reason,
    });
  }
  return slots;
}

/** Compute arrival minutes from a departure + travel hours. */
export function arrivalMin(departureMin: number, travelHours: number): number {
  return departureMin + Math.round(travelHours * MIN_PER_HOUR);
}

export function blocksOverlap(a: TimeBlock, b: TimeBlock): boolean {
  return a.startMin < b.endMin && b.startMin < a.endMin;
}

function overlapsAny(block: TimeBlock, blocks: TimeBlock[]): boolean {
  return blocks.some((b) => blocksOverlap(block, b));
}

/** Build the reserved time block for a booking given departure hour. */
export function buildBlock(departureHour: number, committedHours: number): TimeBlock {
  const startMin = departureHour * MIN_PER_HOUR;
  return { startMin, endMin: startMin + committedHours * MIN_PER_HOUR };
}

/** Whether a proposed booking fits within the working window. */
export function fitsInWorkingDay(block: TimeBlock): boolean {
  return block.startMin >= WORKING_START_MIN && block.endMin <= WORKING_END_MIN;
}

/* ------------------------------------------------------------------ */
/* Formatting helpers                                                  */
/* ------------------------------------------------------------------ */

export function formatCurrency(amount: number): string {
  return '₱' + amount.toLocaleString('en-PH');
}

/** Format minutes-from-midnight as "8:00 AM". */
export function formatTime(min: number): string {
  const totalMin = ((min % 1440) + 1440) % 1440;
  const h24 = Math.floor(totalMin / MIN_PER_HOUR);
  const m = totalMin % MIN_PER_HOUR;
  const period = h24 < 12 ? 'AM' : 'PM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

/** Convert a Date to a local YYYY-MM-DD string (no timezone shift). */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get the current date and time in the salon's local timezone. */
export function getManilaDateTime(now: Date = new Date()): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => {
    const value = parts.find((item) => item.type === type)?.value;
    if (!value) throw new Error(`Missing ${type} in Manila date/time.`);
    return value;
  };
  const hour = Number(part('hour'));
  const minute = Number(part('minute'));
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minutes: hour * MIN_PER_HOUR + minute,
  };
}

/** Parse a YYYY-MM-DD string into a local Date at midnight. */
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format an ISO date for display, e.g. "Mon, 5 Jan 2026". */
export function formatDateLong(iso: string): string {
  const d = fromISODate(iso);
  return d.toLocaleDateString('en-PH', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
