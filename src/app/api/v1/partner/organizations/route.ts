import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";

/**
 * The organizations linked to the key's partner, with the partner's own reference for each (a CRM location id)
 * and the agent who brought it in (null when none) — the list a report starts from.
 * Filter with `agent` (an agent id from /agents); `agent=none` returns the ones with no agent.
 */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const agentParam = new URL(req.url).searchParams.get("agent")?.trim() || null;
  const churches = await prisma.church.findMany({
    where: {
      partnerId: auth.partnerId,
      ...(agentParam ? { partnerAgentId: agentParam === "none" ? null : agentParam } : {}),
    },
    select: { id: true, name: true, partnerReference: true, partnerAgentId: true, status: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  const agents = await prisma.partnerAgent.findMany({ where: { partnerId: auth.partnerId }, select: { id: true, name: true } });
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const data = churches.map((c) => ({
    id: c.id,
    name: c.name,
    reference: c.partnerReference,
    agent: c.partnerAgentId ? { id: c.partnerAgentId, name: agentName.get(c.partnerAgentId) ?? null } : null,
    status: c.status === "ACTIVE" ? "active" : "terminated",
    createdAt: c.createdAt.toISOString(),
  }));
  return apiSuccess(data, requestId, { count: data.length });
});
