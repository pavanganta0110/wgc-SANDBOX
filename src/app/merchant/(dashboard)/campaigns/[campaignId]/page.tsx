import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import CampaignDetailClient from "@/components/merchant/CampaignDetailClient";

export default async function CampaignDetailPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewFundraisingCampaigns")) redirect("/merchant/dashboard");

  const [campaign, church] = await Promise.all([
    prisma.fundraisingCampaign.findFirst({ where: { id: campaignId, churchId: auth.churchId } }),
    prisma.church.findUnique({ where: { id: auth.churchId }, select: { name: true, logoUrl: true } }),
  ]);
  if (!campaign) notFound();
  const availableGivingLinks = await prisma.givingLink.findMany({
    where: {
      churchId: auth.churchId,
      status: "ACTIVE",
      campaignTeamId: null,
      campaignFundraiserId: null,
      OR: [{ fundraisingCampaignId: null }, { fundraisingCampaignId: campaign.id }],
    },
    select: { id: true, internalName: true, publicSlug: true },
    orderBy: { internalName: "asc" },
  });
  const givingLink = campaign.givingLinkId
    ? await prisma.givingLink.findFirst({ where: { id: campaign.givingLinkId, churchId: auth.churchId }, select: { id: true, publicSlug: true } })
    : null;

  return (
    <CampaignDetailClient
      campaign={{
        id: campaign.id,
        name: campaign.name,
        slug: campaign.slug,
        status: campaign.status,
        description: campaign.description,
        imageUrl: campaign.imageUrl,
        goalAmountCents: campaign.goalAmountCents,
        startDate: campaign.startDate ? campaign.startDate.toISOString().slice(0, 10) : null,
        endDate: campaign.endDate ? campaign.endDate.toISOString().slice(0, 10) : null,
        leaderboardEnabled: campaign.leaderboardEnabled,
        fundraiserSelfEditEnabled: campaign.fundraiserSelfEditEnabled,
        pageBackground: campaign.pageBackground,
        wallBackground: campaign.wallBackground,
      }}
      givingLink={givingLink}
      availableGivingLinks={availableGivingLinks}
      churchName={church?.name || "Your Organization"}
      churchLogoUrl={church?.logoUrl}
      canEdit={hasPermission(auth, "canEditFundraisingCampaign")}
      canManageRoster={hasPermission(auth, "canManageCampaignRoster")}
      canArchive={hasPermission(auth, "canArchiveFundraisingCampaign")}
    />
  );
}
