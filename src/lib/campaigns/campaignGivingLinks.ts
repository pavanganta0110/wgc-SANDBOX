import { prisma } from "@/lib/prisma";
import { generatePublicSlug } from "@/lib/givingLinks/validation";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";

/**
 * Auto-provisions the dedicated "give here" GivingLink behind a
 * FundraisingCampaign, CampaignTeam, or CampaignFundraiser's public page.
 * Donors always check out through the exact same, already-tested public
 * giving flow (/g/[slug]) as any other giving link — nothing about
 * checkout, Finix, fees, or receipts changes for a campaign-tagged link.
 *
 * Exactly one of campaignId/teamId/fundraiserId's context fields should be
 * set by the caller; fundraisingCampaignId is always included so
 * campaign-level rollups never have to walk down through team/fundraiser
 * rows (see campaignTotals.ts).
 */
export async function provisionCampaignGivingLink(params: {
  churchId: string;
  internalName: string;
  publicTitle: string;
  // Null when provisioned by a machine actor (e.g. the /api/v1 campaigns
  // API) rather than a logged-in staff member — GivingLink.ownerUserId/
  // createdByUserId are both nullable for exactly this case.
  ownerUserId: string | null;
  fundraisingCampaignId: string;
  campaignTeamId?: string | null;
  campaignFundraiserId?: string | null;
}): Promise<string> {
  let publicSlug = generatePublicSlug();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await prisma.givingLink.findUnique({ where: { publicSlug } });
    if (!existing) break;
    publicSlug = generatePublicSlug();
  }

  const link = await prisma.givingLink.create({
    data: {
      churchId: params.churchId,
      publicSlug,
      internalName: params.internalName,
      publicTitle: params.publicTitle,
      status: "ACTIVE",
      amountType: "VARIABLE",
      allowCustomAmount: true,
      suggestedAmountsJson: [2500, 5000, 10000, 25000],
      linkType: "MULTI_USE",
      recurringEnabled: true,
      allowedFrequenciesJson: ["MONTHLY"],
      allowedPaymentMethodsJson: ["CARD", "BANK", "APPLE_PAY", "GOOGLE_PAY"],
      donorFieldSettingsJson: DEFAULT_DONOR_FIELD_SETTINGS,
      collectMailingAddress: false,
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
      createdByUserId: params.ownerUserId,
      ownerUserId: params.ownerUserId,
      fundraisingCampaignId: params.fundraisingCampaignId,
      campaignTeamId: params.campaignTeamId ?? null,
      campaignFundraiserId: params.campaignFundraiserId ?? null,
    },
  });

  return link.id;
}
