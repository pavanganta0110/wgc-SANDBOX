import { prisma } from "@/lib/prisma";
import { loadPublicGivingPageData, type PublicGivingPageData } from "@/lib/givingLinks/loadPublicGivingPageData";

export type OrganizationGivingPage =
  | { ok: false; notFound: true }
  | { ok: true; linkSlug: string; data: Extract<PublicGivingPageData, { ok: true }> };

/**
 * The giving link an organization's generated page (/donate/[orgSlug]) shows.
 * `preferredLinkSlug` (from ?link=) wins when it is one of this organization's
 * own links; otherwise the newest general-purpose active link that can really
 * be paid (not an event checkout, a campaign link or a merchandise link).
 * Every candidate goes through the same loader as the hosted /g/ page, so
 * approval, status and availability rules are identical.
 */
export async function loadOrganizationGivingPage(orgSlug: string, preferredLinkSlug?: string | null): Promise<OrganizationGivingPage> {
  const church = await prisma.church.findUnique({ where: { slug: orgSlug }, select: { id: true } });
  if (!church) return { ok: false, notFound: true };

  const candidates = await prisma.givingLink.findMany({
    where: { churchId: church.id, status: "ACTIVE", fundraisingCampaignId: null, merchandiseEnabled: false },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: { publicSlug: true },
  });

  const ordered = [
    ...candidates.filter((c) => c.publicSlug === preferredLinkSlug),
    ...candidates.filter((c) => c.publicSlug !== preferredLinkSlug),
  ];

  for (const c of ordered) {
    const data = await loadPublicGivingPageData(c.publicSlug);
    if (data.ok) return { ok: true, linkSlug: c.publicSlug, data };
  }
  return { ok: false, notFound: true };
}
