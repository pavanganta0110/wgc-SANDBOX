import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import AdminMfaSetupForm from "./AdminMfaSetupForm";

/**
 * Mandatory MFA enrollment — reached via the dashboard layout's redirect
 * for any admin whose session has mfaEnabled: false, or by navigating here
 * directly. Deliberately outside the (dashboard) route group so it doesn't
 * itself hit that layout's gate (which would just redirect back here).
 */
export default async function AdminMfaSetupPage() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  if (session.mfaEnabled) {
    redirect("/admin");
  }

  return <AdminMfaSetupForm email={session.email} />;
}
