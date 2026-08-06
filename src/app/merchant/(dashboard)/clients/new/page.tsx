import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import ClientForm from "@/components/merchant/ClientForm";

export default async function NewClientPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  try {
    requirePermission(auth, "canManageClients");
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/merchant/clients");
    throw err;
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-slate-900 mb-4">New Client</h2>
      <ClientForm mode="create" />
    </div>
  );
}
