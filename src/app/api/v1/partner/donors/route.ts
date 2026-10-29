import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { pageWithOrganization, resolvePartnerListScope } from "@/lib/partners/partnerApiScope";

/**
 * Donors of the partner's organizations (the same fields as GET /api/v1/donors), each with its
 * `organization`. Filter with `organization`, page with `limit` and `cursor`.
 */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const resolved = await resolvePartnerListScope(req, auth, requestId);
  if ("response" in resolved) return resolved.response;
  const { scope } = resolved;

  const donors = await prisma.donor.findMany({
    where: { churchId: { in: scope.churchIds }, archivedAt: null },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: scope.limit + 1,
    ...(scope.cursor ? { cursor: { id: scope.cursor }, skip: 1 } : {}),
    select: { id: true, churchId: true, name: true, email: true, phone: true, anonymousPreference: true, createdAt: true, updatedAt: true },
  });

  const { data, hasMore, nextCursor } = pageWithOrganization(donors, scope);
  return apiSuccess(data, requestId, { count: data.length, hasMore, nextCursor });
});
