import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";

/**
 * The partner's agents, each with the Get Started link that credits an application to that agent.
 * Add the partner's own id for the organization with `&ref=`; prefill with `org`, `name`, `email`, `phone`, `website`.
 */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const code = await ensureOnboardingCode(auth.partnerId);
  const origin = new URL(req.url).origin;
  const agents = await prisma.partnerAgent.findMany({
    where: { partnerId: auth.partnerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, status: true, createdAt: true },
  });
  const counts = await prisma.church.groupBy({ by: ["partnerAgentId"], where: { partnerId: auth.partnerId, partnerAgentId: { not: null } }, _count: { _all: true } });
  const orgs = new Map(counts.map((c) => [c.partnerAgentId, c._count._all]));
  const data = agents.map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status === "ACTIVE" ? "active" : "inactive",
    organizations: orgs.get(a.id) ?? 0,
    getStartedUrl: `${origin}/start?partner=${code}&agent=${a.id}`,
    createdAt: a.createdAt.toISOString(),
  }));
  return apiSuccess(data, requestId, { count: data.length });
});
