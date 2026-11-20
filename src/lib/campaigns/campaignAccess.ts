import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/**
 * Which fundraising campaigns a user may see. Owners and admins see all of
 * them. A FUNDRAISER only sees campaigns they raise funds for: ones they created
 * or ones with a giving link they own, so they can't browse other campaigns'
 * totals, teams and fundraisers.
 */
export async function campaignVisibilityWhere(auth: MerchantAuthContext): Promise<Prisma.FundraisingCampaignWhereInput> {
  if (auth.role !== "fundraiser") return {};
  const links = await prisma.givingLink.findMany({
    where: { churchId: auth.churchId, ownerUserId: auth.userId, fundraisingCampaignId: { not: null } },
    select: { fundraisingCampaignId: true },
  });
  const ids = [...new Set(links.map((l) => l.fundraisingCampaignId).filter((x): x is string => !!x))];
  return { OR: [{ createdByUserId: auth.userId }, ...(ids.length ? [{ id: { in: ids } }] : [])] };
}
