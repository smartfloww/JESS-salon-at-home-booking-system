import { NextResponse } from 'next/server';
import {
  calculateDuration,
  getServiceArea,
  getDepartureSlots,
  validateCombination,
  type BookingSelection,
} from '@/lib/booking';
import { getReservedBlocks } from '@/lib/booking-server';
import { isSupabaseConfigured } from '@/lib/env';

/**
 * POST /api/bookings/availability
 *
 * Returns the available departure slots for a given date + selection.
 * The selection is re-validated server-side; pricing is NOT trusted
 * from the browser.
 *
 * If Supabase is not configured, returns a 503 with a clear message —
 * the client shows a configuration notice. (This is not a "mock";
 * availability genuinely cannot be checked without the database.)
 */
export async function POST(request: Request) {
  let body: {
    selection: BookingSelection;
    date: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { selection, date } = body;
  if (!selection || !date || typeof date !== 'string') {
    return NextResponse.json({ error: 'Missing selection or date.' }, { status: 400 });
  }

  // Validate the date format (YYYY-MM-DD).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Invalid date.' }, { status: 400 });
  }

  const haircutQty = Math.max(0, Math.floor(selection.haircutQuantity || 0));
  const majorCount = (selection.majorSelections ?? []).length;

  // Combination rules (server-authoritative).
  const combo = validateCombination(haircutQty, majorCount);
  if (!combo.valid) {
    return NextResponse.json({ error: combo.reason }, { status: 422 });
  }

  const area = getServiceArea(selection.serviceAreaId);
  if (!area) {
    return NextResponse.json({ error: 'Please select a service area.' }, { status: 422 });
  }

  const duration = calculateDuration(selection);
  if (duration.committedHours > 10) {
    return NextResponse.json(
      {
        error:
          'This combination of services is too long to fit within a single working day (8 AM–6 PM). Please reduce your selection or contact JESS for a custom arrangement.',
      },
      { status: 422 },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: 'Availability cannot be checked — the booking database is not configured.' },
      { status: 503 },
    );
  }

  let reserved;
  try {
    reserved = await getReservedBlocks(date);
  } catch {
    return NextResponse.json(
      { error: 'Could not load availability. Please try again.' },
      { status: 500 },
    );
  }

  const slots = getDepartureSlots(
    duration.committedHours,
    duration.travelHours,
    date,
    reserved,
  );

  return NextResponse.json({
    date,
    committedHours: duration.committedHours,
    serviceHours: duration.serviceHours,
    travelHours: duration.travelHours,
    slots: slots.map((s) => ({
      hour: s.hour,
      label: `${formatHour(s.hour)}`,
      arrivalLabel: formatMin(s.arrivalMin),
      completionLabel: formatMin(s.completionMin),
      available: s.available,
      reason: s.reason,
    })),
  });
}

function formatHour(h: number): string {
  const period = h < 12 ? 'AM' : 'PM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:00 ${period}`;
}

function formatMin(min: number): string {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}
