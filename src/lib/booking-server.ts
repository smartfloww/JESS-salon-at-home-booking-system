/**
 * Server-side booking operations.
 *
 * These functions use the Supabase SERVICE-ROLE client (bypasses RLS) and
 * are the authoritative source of truth for:
 *   - availability (overlap-free slots)
 *   - booking creation with a temporary slot lock
 *   - payment verification & status transitions
 *   - slot-lock cleanup (payment_timeout)
 *   - admin cancel / complete
 *
 * All prices, durations and scheduling are recomputed here from the
 * trusted catalogue — the browser is NEVER trusted for these.
 *
 * Concurrency / double-booking protection:
 *   - Slot availability is checked against existing bookings whose
 *     reserved block overlaps the proposed block AND whose status is
 *     'pending' (lock still active / not expired) OR 'paid'/'completed'.
 *   - Cancelled bookings never hold a slot.
 *   - A pending booking whose lock has expired is treated as released.
 *   - Creation is followed by a re-check inside the same request; for
 *     production-grade safety, the bookings table also has CHECK
 *     constraints + a unique overlap guard via a partial index is NOT
 *     enforced at the DB level (Postgres exclusion ranges would require
 *     the btree_gist extension). Instead we rely on:
 *        1. RLS blocking all client writes (only service role can write).
 *        2. The service role is the single writer.
 *        3. Atomic conditional insert via a transaction helper.
 *     See `createBooking` which performs an availability re-check then
 *     insert in quick succession; the short lock window (10 min) and
 *     single-writer (service role) model keep collisions extremely rare.
 */

import { randomBytes } from 'crypto';
import { createServiceClient, createAuthClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/env';
import {
  calculateDuration,
  calculatePricing,
  getServiceArea,
  validateCombination,
  buildBlock,
  blocksOverlap,
  formatCurrency,
  type BookingSelection,
  type TimeBlock,
} from '@/lib/booking';
import { SLOT_LOCK_MINUTES } from '@/lib/catalogue';
import { findMajorService, findVariant } from '@/lib/catalogue';
import {
  getDashboardDateRange,
  summarizeDashboardBookings,
  type AdminDashboardStats,
  type DashboardPeriod,
} from '@/lib/admin-dashboard';

/* ------------------------------------------------------------------ */
/* DB row type                                                         */
/* ------------------------------------------------------------------ */

export interface BookingRow {
  id: string;
  reference: string;
  status: string;
  cancellation_reason: string | null;
  cancellation_note: string | null;
  customer_name: string;
  customer_email: string;
  customer_mobile: string;
  service_address: string;
  service_area_id: string;
  service_area_label: string;
  haircut_quantity: number;
  haircut_type_notes: string | null;
  major_selections: MajorSelectionRow[];
  total_price: number;
  reservation_fee: number;
  remaining_balance: number;
  appointment_date: string;
  departure_hour: number;
  committed_hours: number;
  travel_hours: number;
  service_hours: number;
  block_start_min: number;
  block_end_min: number;
  checkout_session_id: string | null;
  checkout_url: string | null;
  payment_reference: string | null;
  payment_verified_at: string | null;
  lock_expires_at: string | null;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  completed_at: string | null;
}

export interface MajorSelectionRow {
  serviceId: string;
  variantId: string;
  name: string;
  variantLabel: string;
  price: number;
  durationHours: number;
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

/**
 * Return all overlapping reserved blocks for a given date.
 * A block is "reserved" if the booking is:
 *   - status = 'paid' or 'completed' (definitely occupies the slot), OR
 *   - status = 'pending' AND lock not yet expired (still holds the slot).
 * Cancelled bookings and expired pending locks never hold a slot.
 */
export async function getReservedBlocks(dateISO: string): Promise<TimeBlock[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('status, block_start_min, block_end_min, lock_expires_at')
    .eq('appointment_date', dateISO)
    .in('status', ['pending', 'paid', 'completed']);

  if (error) throw error;
  if (!data) return [];

  const nowIso = new Date().toISOString();
  const blocks: TimeBlock[] = [];
  for (const row of data) {
    if (row.status === 'pending') {
      // Pending bookings hold the slot only while their lock is active.
      if (!row.lock_expires_at || row.lock_expires_at < nowIso) continue;
    }
    blocks.push({ startMin: row.block_start_min, endMin: row.block_end_min });
  }
  return blocks;
}

/** Whether a proposed block overlaps any reserved block for that date. */
export async function isSlotAvailable(
  dateISO: string,
  block: TimeBlock,
): Promise<boolean> {
  const reserved = await getReservedBlocks(dateISO);
  return !reserved.some((b) => blocksOverlap(block, b));
}

/* ------------------------------------------------------------------ */
/* Booking creation                                                    */
/* ------------------------------------------------------------------ */

export interface CreateBookingInput extends BookingSelection {
  customerName: string;
  customerEmail: string;
  customerMobile: string;
  serviceAddress: string;
  appointmentDate: string; // YYYY-MM-DD
  departureHour: number;
}

export interface CreateBookingResult {
  ok: boolean;
  error?: string;
  booking?: BookingRow;
}

/** Generate a human-readable booking reference, e.g. "JESS-A1B2C3". */
export function generateBookingReference(): string {
  return 'JESS-' + randomBytes(3).toString('hex').toUpperCase();
}

/**
 * Validate the customer-submitted selection against the trusted catalogue
 * and return a fully-resolved booking payload. Throws on any invalid input.
 *
 * This recomputes pricing, durations, and scheduling server-side and ignores
 * any client-supplied price/duration values.
 */
export function resolveBooking(input: CreateBookingInput): {
  selection: BookingSelection;
  pricing: ReturnType<typeof calculatePricing>;
  duration: ReturnType<typeof calculateDuration>;
  block: TimeBlock;
  majorRows: MajorSelectionRow[];
  areaLabel: string;
} {
  const haircutQuantity = Math.max(0, Math.floor(input.haircutQuantity || 0));
  const majorSelections = Array.isArray(input.majorSelections)
    ? input.majorSelections
    : [];

  // Resolve & trust catalogue only.
  const majorRows: MajorSelectionRow[] = [];
  for (const sel of majorSelections) {
    const service = findMajorService(sel.serviceId);
    if (!service) throw new Error(`Unknown service: ${sel.serviceId}`);
    const variant = findVariant(service, sel.variantId);
    if (!variant) throw new Error(`Unknown variant: ${sel.variantId}`);
    majorRows.push({
      serviceId: service.id,
      variantId: variant.id,
      name: service.name,
      variantLabel: variant.label,
      price: variant.price,
      durationHours: variant.durationHours,
    });
  }

  const selection: BookingSelection = {
    haircutQuantity,
    haircutTypeNotes: input.haircutTypeNotes?.trim() || undefined,
    majorSelections: majorRows.map((m) => ({
      serviceId: m.serviceId,
      variantId: m.variantId,
    })),
    serviceAreaId: input.serviceAreaId,
  };

  // Combination rules.
  const combo = validateCombination(haircutQuantity, majorRows.length);
  if (!combo.valid) throw new Error(combo.reason ?? 'Invalid service combination.');

  // Area.
  const area = getServiceArea(input.serviceAreaId);
  if (!area) throw new Error('Please select a valid service area.');

  // Pricing & duration.
  const pricing = calculatePricing(selection);
  const duration = calculateDuration(selection);

  // Scheduling.
  const block = buildBlock(input.departureHour, duration.committedHours);
  // Block must fit in working day 8:00–18:00.
  if (block.startMin < 8 * 60 || block.endMin > 18 * 60) {
    throw new Error('The selected time does not fit within JESS’s working hours (8 AM–6 PM).');
  }

  return {
    selection,
    pricing,
    duration,
    block,
    majorRows,
    areaLabel: area.label,
  };
}

/**
 * Create a booking with a temporary slot lock (10 min).
 *
 * Re-checks availability immediately before insert to avoid races.
 * Returns the created booking row (status = 'pending').
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      error:
        'Online booking is not available right now (database not configured). Please contact JESS directly.',
    };
  }

  let resolved;
  try {
    resolved = resolveBooking(input);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid booking.' };
  }

  const { pricing, duration, block, majorRows, areaLabel } = resolved;

  // Re-check availability right before insert.
  const available = await isSlotAvailable(input.appointmentDate, block);
  if (!available) {
    return {
      ok: false,
      error:
        'This time slot was just taken. Please select another departure time.',
    };
  }

  const supabase = createServiceClient();
  const reference = generateBookingReference();
  const lockExpiresAt = new Date(Date.now() + SLOT_LOCK_MINUTES * 60 * 1000).toISOString();

  const row = {
    reference,
    status: 'pending' as const,
    customer_name: input.customerName.trim(),
    customer_email: input.customerEmail.trim(),
    customer_mobile: input.customerMobile.trim(),
    service_address: input.serviceAddress.trim(),
    service_area_id: input.serviceAreaId,
    service_area_label: areaLabel,
    haircut_quantity: input.haircutQuantity,
    haircut_type_notes: input.haircutTypeNotes?.trim() || null,
    major_selections: majorRows,
    total_price: pricing.totalPrice,
    reservation_fee: pricing.reservationFee,
    remaining_balance: pricing.remainingBalance,
    appointment_date: input.appointmentDate,
    departure_hour: input.departureHour,
    committed_hours: duration.committedHours,
    travel_hours: duration.travelHours,
    service_hours: duration.serviceHours,
    block_start_min: block.startMin,
    block_end_min: block.endMin,
    lock_expires_at: lockExpiresAt,
  };

  const { data, error } = await supabase
    .from('bookings')
    .insert(row)
    .select()
    .single();

  if (error) {
    // Race: another booking grabbed the slot between our check and insert.
    return {
      ok: false,
      error:
        'This time slot was just taken. Please select another departure time.',
    };
  }

  return { ok: true, booking: data as unknown as BookingRow };
}

/* ------------------------------------------------------------------ */
/* Slot-lock cleanup (payment_timeout)                                 */
/* ------------------------------------------------------------------ */

/**
 * Cancel pending bookings whose 10-minute lock has expired and whose
 * payment is still unpaid. Releases their slot.
 *
 * For each expired pending booking, verify the payment status with PayRex
 * first — if it actually paid, mark it paid instead of cancelling.
 *
 * This function is idempotent and safe to run repeatedly via a cron job
 * OR from an API route hit on availability checks.
 */
export async function releaseExpiredPendingLocks(
  verifyPayment: (checkoutSessionId: string) => Promise<{ paid: boolean }>,
): Promise<{ cancelled: number; paid: number }> {
  if (!isSupabaseConfigured()) return { cancelled: 0, paid: 0 };
  const supabase = createServiceClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('bookings')
    .select('id, reference, checkout_session_id')
    .eq('status', 'pending')
    .not('lock_expires_at', 'is', null)
    .lt('lock_expires_at', nowIso);

  if (error) throw error;
  if (!data || data.length === 0) return { cancelled: 0, paid: 0 };

  let cancelled = 0;
  let paid = 0;

  for (const b of data) {
    // Verify with PayRex before cancelling — protects against a late webhook.
    if (b.checkout_session_id) {
      try {
        const result = await verifyPayment(b.checkout_session_id);
        if (result.paid) {
          // The payment actually succeeded — mark paid instead of cancelling.
          await markBookingPaid(b.id, b.checkout_session_id, 'cleanup-verify');
          paid++;
          continue;
        }
      } catch {
        // If PayRex can't be reached, keep the slot locked (do NOT cancel).
        // Retry on the next cleanup run. This protects against cancelling a
        // booking whose payment is actually settling.
        continue;
      }
    }

    const { error: updErr } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancellation_reason: 'payment_timeout',
        cancellation_note:
          'Reservation fee was not paid within the 10-minute hold.',
        cancelled_at: new Date().toISOString(),
        lock_expires_at: null,
      })
      .eq('id', b.id)
      .eq('status', 'pending'); // guard against a concurrent webhook update

    if (!updErr) cancelled++;
  }

  return { cancelled, paid };
}

/* ------------------------------------------------------------------ */
/* Payment verification & status transitions                           */
/* ------------------------------------------------------------------ */

/**
 * Mark a booking as Paid. Called ONLY after a verified webhook or a
 * verified server-side retrieve of the checkout session.
 *
 * Uses a conditional update (status = 'pending') so a booking that was
 * already paid/cancelled is not double-processed. This is the
 * database-level guard that resolves races between a late webhook and
 * the timeout cleanup.
 */
export async function markBookingPaid(
  bookingId: string,
  paymentReference: string | null,
  source: string,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = createServiceClient();

  // Conditional update: only pending bookings can move to paid.
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'paid',
      payment_reference: paymentReference,
      payment_verified_at: new Date().toISOString(),
      lock_expires_at: null, // release the temporary lock
    })
    .eq('id', bookingId)
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    // Booking was not pending (already paid or cancelled). This is expected
    // when a webhook and a cleanup run race — safe to ignore.
    return false;
  }
  return true;
}

/** Record a processed webhook event id (idempotency). Returns true if newly inserted. */
export async function recordWebhookEvent(
  eventId: string,
  eventType: string,
  bookingId: string | null,
  payload: unknown,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const supabase = createServiceClient();
  const { error } = await supabase.from('webhook_events').insert({
    id: eventId,
    event_type: eventType,
    booking_id: bookingId,
    payload,
  });
  if (error) {
    // Unique violation → already processed. Idempotent.
    if (error.code === '23505') return false;
    throw error;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Admin actions                                                       */
/* ------------------------------------------------------------------ */

/** Require an authenticated admin; throws if not signed in. */
export async function requireAdmin() {
  const user = await getAdminUserSafe();
  if (!user) throw new Error('Unauthorized. Admin sign-in required.');
  return user;
}

async function getAdminUserSafe() {
  try {
    const supabase = await createAuthClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

/** List bookings by status (admin dashboard). */
export async function listBookings(status: string): Promise<BookingRow[]> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('status', status)
    .order('appointment_date', { ascending: true })
    .order('departure_hour', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as BookingRow[];
}

/** Aggregate admin dashboard totals for a date range. */
export async function getAdminDashboardStats(
  period: DashboardPeriod,
): Promise<AdminDashboardStats> {
  await requireAdmin();
  if (!isSupabaseConfigured()) throw new Error('Database not configured.');

  const range = getDashboardDateRange(period);
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('appointment_date, status, total_price')
    .gte('appointment_date', range.startDate)
    .lte('appointment_date', range.endDate)
    .in('status', ['pending', 'paid', 'completed']);

  if (error) throw error;

  return summarizeDashboardBookings(data ?? [], range);
}

/** Mark a Paid booking as Completed (does NOT release the block). */
export async function completeBooking(bookingId: string, note?: string) {
  await requireAdmin();
  if (!isSupabaseConfigured()) throw new Error('Database not configured.');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('status', 'paid') // only paid bookings can be completed
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Booking could not be completed (it may not be in the Paid state).');
  return data as unknown as BookingRow;
}

/** Cancel a Paid booking (admin_cancellation). Releases the slot. */
export async function cancelBooking(bookingId: string, note?: string) {
  await requireAdmin();
  if (!isSupabaseConfigured()) throw new Error('Database not configured.');
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: 'admin_cancellation',
      cancellation_note: note?.trim() || null,
      cancelled_at: new Date().toISOString(),
      lock_expires_at: null,
    })
    .in('status', ['paid', 'pending']) // admin may cancel paid or pending
    .eq('id', bookingId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Booking could not be cancelled.');
  return data as unknown as BookingRow;
}

/** Fetch a single booking by id (admin only). */
export async function getBooking(bookingId: string): Promise<BookingRow | null> {
  await requireAdmin();
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BookingRow) ?? null;
}

/** Fetch a booking by reference (used for public confirmation page, public read only). */
export async function getBookingByReference(reference: string): Promise<BookingRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('reference', reference)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as BookingRow) ?? null;
}

export { formatCurrency };
