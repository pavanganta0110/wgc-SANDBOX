import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import NewPledgeCampaignForm from "@/components/merchant/NewPledgeCampaignForm";

export default async function NewPledgeCampaignPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canCreatePledgeCampaign")) redirect("/merchant/pledge-campaigns");

  const [funds, givingLinks] = await Promise.all([
    prisma.fund.findMany({ where: { churchId: auth.churchId, isActive: true }, select: { id: true, name: true }, orderBy: { displayOrder: "asc" } }),
    prisma.givingLink.findMany({ where: { churchId: auth.churchId, status: "ACTIVE" }, select: { id: true, publicTitle: true, publicSlug: true }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div>
      <h2 className="text-lg font-medium mb-6">New Pledge Campaign</h2>
      <NewPledgeCampaignForm funds={funds} givingLinks={givingLinks} />
    </div>
  );
}
