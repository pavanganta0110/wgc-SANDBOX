import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import CreateSubscriptionWizard from "@/components/merchant/CreateSubscriptionWizard";

export default async function CreateSubscriptionPage() {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — see the
  // matching API-route guard comment for why this back door exists
  // otherwise.
  if (session?.role === "wgc_admin") {
    redirect("/merchant/dashboard");
  }
  const permissions = getSubscriptionPermissions(session?.role);
  if (!permissions.canCreate) redirect("/merchant/subscriptions");

  return <CreateSubscriptionWizard />;
}
