/**
 * GET /api/availability?date=YYYY-MM-DD&serviceMinutes=NUMBER&travelMinutes=NUMBER
 *
 * Returns the list of departure times (minutes from midnight) that are
 * available for a new booking of the requested size on the requested date.
 *
 * This endpoint also opportunistically releases expired pending bookings
 * before computing availability, so callers always see the most current
 * picture.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getAvailableDepartureTimes,
  releaseExpiredPendingBookings,
  manilaToday,
  WORK_START_MIN,
  WORK_END_MIN,
  formatTime,
} from "@/lib/scheduling";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const serviceMinutes = Number(searchParams.get("serviceMinutes") || 0);
  const travelMinutes = Number(searchParams.get("travelMinutes") || 0);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date (expected YYYY-MM-DD)." }, { status: 400 });
  }
  if (!Number.isFinite(serviceMinutes) || serviceMinutes <= 0) {
    return NextResponse.json({ error: "serviceMinutes must be a positive number." }, { status: 400 });
  }
  if (!Number.isFinite(travelMinutes) || travelMinutes < 0) {
    return NextResponse.json({ error: "travelMinutes must be a non-negative number." }, { status: 400 });
  }

  // Today's date in Manila — disallow past dates.
  const today = manilaToday();
  if (date < today) {
    return NextResponse.json({ available: [], note: "Date is in the past." });
  }

  // Compute the reserved block (service + travel, rounded up to next hour).
  const totalCommitted = serviceMinutes + travelMinutes;
  const reservedMinutes = Math.ceil(totalCommitted / 60) * 60;
  if (reservedMinutes > WORK_END_MIN - WORK_START_MIN) {
    return NextResponse.json({
      available: [],
      note: "Requested service + travel exceeds the daily working window.",
    });
  }

  // Opportunistic cleanup.
  await releaseExpiredPendingBookings();

  const times = await getAvailableDepartureTimes(date, reservedMinutes);

  return NextResponse.json({
    date,
    reservedMinutes,
    available: times.map((t) => ({ minutes: t, label: formatTime(t) })),
  });
}
