import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";

/**
 * The organizations linked to the key's partner, with the partner's own
 * reference for each (a CRM location id) — the list a report starts from.
 */
export const GET = withPartnerApiAuth(async (_req, auth, requestId) => {
  const churches = await prisma.church.findMany({
    where: { partnerId: auth.partnerId },
    select: { id: true, name: true, partnerReference: true, status: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  const data = churches.map((c) => ({
    id: c.id,
    name: c.name,
    reference: c.partnerReference,
    status: c.status === "ACTIVE" ? "active" : "terminated",
    createdAt: c.createdAt.toISOString(),
  }));
  return apiSuccess(data, requestId, { count: data.length });
});
