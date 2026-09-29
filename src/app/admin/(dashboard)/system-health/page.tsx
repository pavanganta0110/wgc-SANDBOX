import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import SystemHealthOverviewClient from "./SystemHealthOverviewClient";

/**
 * Admin -> System Health. Global-admin-only (wgc_admin / wgc_super_admin) —
 * no dedicated permission matrix needed since this is read-only monitoring,
 * matching the convention of other read-only admin pages (finix-webhook-events,
 * aplos triage) that just gate on getAdminSession() rather than a
 * fine-grained permission check.
 */
export default async function SystemHealthPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  return <SystemHealthOverviewClient />;
}
