import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/response";
import { addPartnerAgent, AddAgentError } from "@/lib/partners/addPartnerAgent";
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

/**
 * Adds an agent (referral partners only): body { "name": "...", "email": "..." (optional) }. Returns the agent with
 * the Get Started link that credits applications to them. WGC is notified and sets the agent's rate.
 */
export const POST = withPartnerApiAuth(async (req, auth, requestId) => {
  if (auth.partnerType !== "REFERRAL") return apiError("authorization_error", "Only referral partners have agents.", requestId);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const agent = await addPartnerAgent({ partnerId: auth.partnerId, name: body.name, email: body.email, actor: `partner-api:${auth.partnerKeyId}`, via: "api" });
    const code = await ensureOnboardingCode(auth.partnerId);
    const data = { id: agent.id, name: agent.name, status: "active", organizations: 0, getStartedUrl: `${new URL(req.url).origin}/start?partner=${code}&agent=${agent.id}` };
    return NextResponse.json({ data, requestId }, { status: 201, headers: { "X-Request-Id": requestId } });
  } catch (err) {
    if (err instanceof AddAgentError) return apiError("validation_error", err.message, requestId);
    throw err;
  }
});
