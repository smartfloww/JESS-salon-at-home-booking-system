/**
 * GET /api/areas
 * Returns the four service areas with their one-way travel times.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";

export async function GET() {
  const { data: areas, error } = await getSupabaseAdminClient()
    .from("service_areas")
    .select("id, name, travelMinutes:travel_minutes")
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Could not load service areas:", error);
    return NextResponse.json({ error: "Service areas are unavailable." }, { status: 500 });
  }
  return NextResponse.json({
    areas: (areas ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      travelMinutes: a.travelMinutes,
    })),
  });
}
