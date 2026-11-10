import "server-only";

import { getSupabaseAdminClient } from "./db";
import { createSupabaseServerClient } from "./supabase/server";

export async function requireAdmin() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) return null;

  const { data: admin, error } = await getSupabaseAdminClient()
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Could not verify the admin allowlist:", error);
    throw new Error("Admin authorization could not be verified.");
  }

  return admin ? user : null;
}
