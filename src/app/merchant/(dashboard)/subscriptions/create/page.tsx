import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getSubscriptionPermissions } from "@/lib/subscriptions/subscriptionPermissions";
import CreateSubscriptionWizard from "@/components/merchant/CreateSubscriptionWizard";

export default async function CreateSubscriptionPage() {
  const session = await getSession();
  const permissions = getSubscriptionPermissions(session?.role);
  if (!permissions.canCreate) redirect("/merchant/subscriptions");

  return <CreateSubscriptionWizard />;
}
