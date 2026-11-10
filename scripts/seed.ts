/**
 * Seed or update the JESS service catalogue and the four service areas.
 *
 * Usage:  npm run db:seed
 */
import { SEED_SERVICES, SEED_AREAS } from "../src/lib/catalogue";
import { getSupabaseAdminClient } from "./supabase-admin";

async function main() {
  const supabase = getSupabaseAdminClient();

  console.log("→ Seeding service areas…");
  const { error: areaError } = await supabase.from("service_areas").upsert(
    SEED_AREAS.map((area) => ({
      name: area.name,
      travel_minutes: area.travelMinutes,
      sort_order: area.order,
    })),
    { onConflict: "name" },
  );
  if (areaError) {
    throw new Error(`Could not seed service areas: ${areaError.message}`);
  }

  console.log(`→ Seeding ${SEED_SERVICES.length} services…`);
  for (const s of SEED_SERVICES) {
    const { data: service, error: serviceError } = await supabase
      .from("services")
      .upsert(
        {
          slug: s.slug,
          name: s.name,
          category: s.category,
          service_group: s.group,
          base_price: s.basePrice,
          base_duration: s.baseDuration,
          note: s.note ?? null,
          sort_order: s.order,
        },
        { onConflict: "slug" },
      )
      .select("id")
      .single();
    if (serviceError) {
      throw new Error(`Could not seed service ${s.slug}: ${serviceError.message}`);
    }

    if (s.variants?.length) {
      const { error: variantsError } = await supabase
        .from("service_variants")
        .upsert(
          s.variants.map((variant) => ({
            service_id: service.id,
            name: variant.name,
            price: variant.price,
            duration: variant.duration,
          })),
          { onConflict: "service_id,name" },
        );
      if (variantsError) {
        throw new Error(
          `Could not seed variants for ${s.slug}: ${variantsError.message}`,
        );
      }
    } else {
      const { error: variantsError } = await supabase
        .from("service_variants")
        .delete()
        .eq("service_id", service.id);
      if (variantsError) {
        throw new Error(
          `Could not clear obsolete variants for ${s.slug}: ${variantsError.message}`,
        );
      }
    }
  }

  console.log("✔ Catalogue and service areas seeded.");
  console.log(
    "ℹ️  Admin Auth users must be created in Supabase Auth and explicitly added to public.admin_users.",
  );
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exitCode = 1;
});
