import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { getCampaignRaisedCents } from "@/lib/campaigns/campaignTotals";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { pageWithOrganization, resolvePartnerListScope } from "@/lib/partners/partnerApiScope";

/** Fundraising campaigns of the partner's organizations, with the amount raised, each with its `organization`. Optional `status`. */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const resolved = await resolvePartnerListScope(req, auth, requestId);
  if ("response" in resolved) return resolved.response;
  const { scope } = resolved;
  const status = scope.searchParams.get("status") || undefined;

  const campaigns = await prisma.fundraisingCampaign.findMany({
    where: { churchId: { in: scope.churchIds }, archivedAt: null, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: scope.limit + 1,
    ...(scope.cursor ? { cursor: { id: scope.cursor }, skip: 1 } : {}),
    select: { id: true, churchId: true, name: true, description: true, slug: true, status: true, goalAmountCents: true, startDate: true, endDate: true, createdAt: true },
  });

  const { data, hasMore, nextCursor } = pageWithOrganization(campaigns, scope);
  // Each total is read inside that campaign's own organization, never across organizations.
  const withTotals = await Promise.all(data.map(async (c) => ({ ...c, raisedCents: c.organization ? await getCampaignRaisedCents(c.organization.id, c.id) : 0 })));
  return apiSuccess(withTotals, requestId, { count: withTotals.length, hasMore, nextCursor });
});
