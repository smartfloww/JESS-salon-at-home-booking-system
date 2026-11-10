/**
 * JESS admin dashboard root route.
 *
 * Server component — performs the session check server-side and either
 * redirects to /admin/login or renders the interactive client dashboard.
 *
 * There is no public link to /admin anywhere in the site header. JESS
 * accesses this URL directly.
 */

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { AdminDashboard } from "@/components/admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) {
    redirect("/admin/login");
  }
  return <AdminDashboard />;
}
