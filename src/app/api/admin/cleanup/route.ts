/**
 * POST /api/admin/cleanup
 * Manually triggers the expired-pending-bookings cleanup. Useful for testing
 * and as a fallback if no other request hits the availability endpoint.
 */

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { releaseExpiredPendingBookings } from "@/lib/scheduling";

export async function POST() {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const released = await releaseExpiredPendingBookings();
  return NextResponse.json({ ok: true, released });
}
