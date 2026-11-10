/**
 * GET /api/services
 * Returns the full service catalogue grouped for the booking UI.
 */

import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/db";

export async function GET() {
  const { data: services, error } = await getSupabaseAdminClient()
    .from("services")
    .select(
      "id, slug, name, category, group:service_group, basePrice:base_price, baseDuration:base_duration, note, order:sort_order, variants:service_variants(id, name, price, duration)",
    )
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("Could not load services:", error);
    return NextResponse.json({ error: "Service catalogue is unavailable." }, { status: 500 });
  }

  // Group by `group` preserving order
  const groups: Record<string, NonNullable<typeof services>> = {};
  for (const s of services ?? []) {
    if (!groups[s.group]) groups[s.group] = [];
    groups[s.group].push(s);
  }

  const result = Object.entries(groups).map(([group, items]) => ({
    group,
    items: items.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      category: s.category,
      group: s.group,
      basePrice: s.basePrice,
      baseDuration: s.baseDuration,
      note: s.note,
      order: s.order,
      variants: (s.variants ?? [])
        .map((v) => ({
          id: v.id,
          name: v.name,
          price: v.price,
          duration: v.duration,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    })),
  }));

  return NextResponse.json({ groups: result });
}
