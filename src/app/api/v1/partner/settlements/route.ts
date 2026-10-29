import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { pageWithOrganization, resolvePartnerListScope } from "@/lib/partners/partnerApiScope";

/** Settlements (payouts) of the partner's organizations (the same fields as GET /api/v1/settlements), each with its `organization`. */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const resolved = await resolvePartnerListScope(req, auth, requestId);
  if ("response" in resolved) return resolved.response;
  const { scope } = resolved;

  const settlements = await prisma.finixSettlement.findMany({
    where: { churchId: { in: scope.churchIds } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: scope.limit + 1,
    ...(scope.cursor ? { cursor: { id: scope.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      churchId: true,
      finixSettlementId: true,
      state: true,
      totalAmountCents: true,
      netAmountCents: true,
      feeAmountCents: true,
      currency: true,
      accruedAt: true,
      settledAt: true,
      createdAt: true,
    },
  });

  const { data, hasMore, nextCursor } = pageWithOrganization(settlements, scope);
  return apiSuccess(data, requestId, { count: data.length, hasMore, nextCursor });
});
