import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import EventSettingsForm from "@/components/events/merchant/EventSettingsForm";
import { loadOrganizationBrand } from "@/lib/eventRegistration/organizationBrand";

export default async function NewEventPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageEvents")) redirect("/merchant/events");

  const organization = await loadOrganizationBrand(auth.churchId);

  return (
    <div>
      <Link href="/merchant/events" className="text-sm text-indigo-600 hover:underline">← Events</Link>
      <h2 className="text-lg font-medium mt-2 mb-6">New event</h2>
      <EventSettingsForm organization={organization} />
    </div>
  );
}
