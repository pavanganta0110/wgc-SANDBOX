import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { pageWithOrganization, resolvePartnerListScope } from "@/lib/partners/partnerApiScope";

/** Giving links of the partner's organizations (the same fields as GET /api/v1/giving-links), each with its `organization`. Optional `status`. */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const resolved = await resolvePartnerListScope(req, auth, requestId);
  if ("response" in resolved) return resolved.response;
  const { scope } = resolved;
  const status = scope.searchParams.get("status") || undefined;

  const links = await prisma.givingLink.findMany({
    where: { churchId: { in: scope.churchIds }, ...(status ? { status } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: scope.limit + 1,
    ...(scope.cursor ? { cursor: { id: scope.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      churchId: true,
      publicSlug: true,
      internalName: true,
      publicTitle: true,
      status: true,
      totalCollectedCents: true,
      refundedCents: true,
      returnedCents: true,
      successfulDonations: true,
      createdAt: true,
    },
  });

  const { data, hasMore, nextCursor } = pageWithOrganization(links, scope);
  const shaped = data.map((l) => ({
    id: l.id,
    publicSlug: l.publicSlug,
    url: `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/g/${l.publicSlug}`,
    internalName: l.internalName,
    publicTitle: l.publicTitle,
    status: l.status,
    netCollectedCents: l.totalCollectedCents - l.refundedCents - l.returnedCents,
    successfulDonations: l.successfulDonations,
    createdAt: l.createdAt,
    organization: l.organization,
  }));
  return apiSuccess(shaped, requestId, { count: shaped.length, hasMore, nextCursor });
});
