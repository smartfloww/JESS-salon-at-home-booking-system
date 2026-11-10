/**
 * PATCH /api/admin/bookings/[id]/cancel
 * Cancels a paid or pending booking. Releases the reserved time so the slot
 * becomes available again. Stores cancellationReason = "admin_cancellation".
 *
 * A pending booking that already has a successful payment cannot be cancelled
 * here — that case is guarded by the status check below.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { data: result, error } = await getSupabaseAdminClient().rpc(
    "admin_cancel_booking",
    { p_booking_id: id },
  );
  if (error) {
    console.error("Could not cancel booking:", error);
    return NextResponse.json({ error: "Booking could not be cancelled." }, { status: 500 });
  }

  if (result.result === "not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (result.result === "completed") {
    return NextResponse.json(
      { error: "Completed bookings cannot be cancelled." },
      { status: 400 },
    );
  }
  if (result.result === "payment_conflict") {
    return NextResponse.json(
      { error: "This booking has a successful payment and was switched to Paid." },
      { status: 400 },
    );
  }
  if (result.result === "already_cancelled") {
    return NextResponse.json({ ok: true, already: true, status: "cancelled" });
  }
  if (result.result !== "cancelled") {
    console.error("Unexpected admin cancellation result:", result);
    return NextResponse.json({ error: "Booking could not be cancelled." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
