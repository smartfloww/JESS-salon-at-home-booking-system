/**
 * PATCH /api/admin/bookings/[id]/complete
 * Marks a paid booking as Completed. Does NOT release the reserved time.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const { data: result, error } = await getSupabaseAdminClient().rpc(
    "admin_complete_booking",
    { p_booking_id: id },
  );
  if (error) {
    console.error("Could not complete booking:", error);
    return NextResponse.json({ error: "Booking could not be updated." }, { status: 500 });
  }
  if (result === "not_found") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (result === "invalid_status") {
    return NextResponse.json(
      { error: "Only paid bookings can be marked Completed." },
      { status: 400 },
    );
  }
  if (result !== "completed") {
    console.error("Unexpected admin completion result:", result);
    return NextResponse.json({ error: "Booking could not be updated." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status: result });
}
