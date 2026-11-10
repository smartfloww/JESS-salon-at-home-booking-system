/**
 * Scheduling logic for JESS Salon at Home.
 *
 * Working hours: 8:00–18:00 every day (Manila time).
 * Maximum working window: 10 hours per day.
 *
 * Customers select when JESS leaves her base (departure time).
 * Total committed time = sum(service durations) + one-way travel time,
 * rounded UP to the next complete hour.
 *
 * Departure intervals are 1 hour (08:00, 09:00, …, 18:00).
 * A booking must fit completely inside 8:00–18:00.
 *
 * JESS does one appointment at a time. Multiple sequential bookings are
 * allowed as long as they don't overlap and stay inside the daily window.
 */

// Minutes from 00:00.
export const WORK_START_MIN = 8 * 60; // 08:00
export const WORK_END_MIN = 18 * 60; // 18:00
export const MAX_DAILY_WINDOW_MIN = 10 * 60; // 10 hours
export const DEPARTURE_STEP_MIN = 60; // 1-hour intervals

/**
 * Round minutes up to the next complete hour.
 * e.g. 150 → 180, 180 → 180, 181 → 240.
 */
export function roundUpToHour(minutes: number): number {
  if (minutes <= 0) return 0;
  if (minutes % 60 === 0) return minutes;
  return Math.ceil(minutes / 60) * 60;
}

/**
 * Compute the reserved block (minutes) for a booking.
 * `serviceMinutes` is the sum of all selected service durations.
 * `travelMinutes` is the one-way travel time for the chosen area.
 */
export function computeReservedMinutes(serviceMinutes: number, travelMinutes: number): number {
  const total = serviceMinutes + travelMinutes;
  return roundUpToHour(total);
}

/**
 * Generate every possible departure time (in minutes from 00:00) for a given
 * reserved block size, ignoring existing bookings.
 */
export function rawDepartureOptions(reservedMinutes: number): number[] {
  const options: number[] = [];
  for (let t = WORK_START_MIN; t + reservedMinutes <= WORK_END_MIN; t += DEPARTURE_STEP_MIN) {
    options.push(t);
  }
  return options;
}

/**
 * Format minutes-from-midnight as "h:mm AM/PM" (12-hour).
 */
export function formatTime(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
}

// ---------------------------------------------------------------------------
// Availability computation
// ---------------------------------------------------------------------------

export interface ExistingBlock {
  departureTime: number; // minutes from 00:00
  reservedMinutes: number;
  status: string; // booking status
}

/**
 * Returns all departure times (minutes from midnight) that:
 *  - fit completely inside the 8:00–18:00 window with the given reserved block
 *  - do NOT overlap any existing (paid OR pending_payment AND not expired) block
 *  - do NOT push the daily committed time over MAX_DAILY_WINDOW_MIN
 */
export async function getAvailableDepartureTimes(
  date: string, // YYYY-MM-DD (Manila)
  reservedMinutes: number,
  excludeBookingId?: string,
): Promise<number[]> {
  // 1. Pull all blocks for the date that occupy time.
  // A "pending_payment" booking with an expired payment deadline and no
  // successful payment should have been cleaned up; we still treat it as
  // non-blocking here as a safety net by checking paymentDeadline.
  const now = new Date();
  const { getSupabaseAdminClient } = await import("./db");
  let query = getSupabaseAdminClient()
    .from("bookings")
    .select("id, departure_time, reserved_minutes, status, payment_deadline")
    .eq("appointment_date", date)
    .in("status", ["pending_payment", "paid", "completed"]);
  if (excludeBookingId) query = query.neq("id", excludeBookingId);
  const { data: bookings, error } = await query;
  if (error) {
    console.error("Could not load bookings for availability:", error);
    throw new Error("Availability could not be checked.");
  }

  const blocks: ExistingBlock[] = (bookings ?? [])
    .filter((b) => {
      // Drop expired pending reservations that haven't been paid.
      if (b.status === "pending_payment") {
        if (b.payment_deadline && new Date(b.payment_deadline) < now) {
          return false;
        }
      }
      return true;
    })
    .map((b) => ({
      departureTime: b.departure_time,
      reservedMinutes: b.reserved_minutes,
      status: b.status,
    }));

  const totalCommitted = blocks.reduce((sum, b) => sum + b.reservedMinutes, 0);
  const remainingDailyCapacity = Math.max(0, MAX_DAILY_WINDOW_MIN - totalCommitted);

  const result: number[] = [];
  for (let t = WORK_START_MIN; t + reservedMinutes <= WORK_END_MIN + 1; t += DEPARTURE_STEP_MIN) {
    if (reservedMinutes > remainingDailyCapacity) {
      // Would push the day over the 10-hour cap.
      continue;
    }
    const newStart = t;
    const newEnd = t + reservedMinutes;

    // Overlap test against every existing block.
    const overlaps = blocks.some((b) => {
      const s = b.departureTime;
      const e = b.departureTime + b.reservedMinutes;
      return newStart < e && s < newEnd;
    });
    if (!overlaps) result.push(t);
  }

  return result;
}

/**
 * Return the Manila "today" date string in YYYY-MM-DD.
 *
 * The salon operates in Asia/Manila. We use Intl with timeZone to avoid
 * depending on the host's local clock.
 */
export function manilaToday(): string {
  return manilaDateString(new Date());
}

export function manilaDateString(d: Date): string {
  // Format: YYYY-MM-DD in Asia/Manila.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const day = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${day}`;
}

/**
 * Build a Date object for a given YYYY-MM-DD + minutes-from-midnight, interpreted
 * in Asia/Manila. The result is a real UTC Date that, when formatted in Manila,
 * shows the requested wall-clock time.
 */
export function manilaTimeFromDate(date: string, minutesFromMidnight: number): Date {
  // date is "YYYY-MM-DD"
  const [y, m, d] = date.split("-").map(Number);
  // Manila is UTC+8 (no DST). Construct the UTC timestamp that corresponds to
  // the requested wall-clock time minus 8 hours.
  const utcHour = Math.floor(minutesFromMidnight / 60);
  const utcMin = minutesFromMidnight % 60;
  return new Date(Date.UTC(y, m - 1, d, utcHour - 8, utcMin, 0, 0));
}

/**
 * Cleanup expired pending bookings: any booking in `pending_payment` whose
 * payment deadline has passed AND that has no successful payment is marked
 * `cancelled` with reason `payment_timeout`.
 *
 * Returns the number of bookings released.
 */
export async function releaseExpiredPendingBookings(): Promise<number> {
  const { getSupabaseAdminClient } = await import("./db");
  const { data, error } = await getSupabaseAdminClient().rpc(
    "release_expired_pending_bookings",
  );
  if (error) {
    console.error("Could not release expired pending bookings:", error);
    throw new Error("Expired bookings could not be cleaned up.");
  }
  if (data === null) {
    throw new Error("Expired-booking cleanup returned no result.");
  }
  return data;
}
