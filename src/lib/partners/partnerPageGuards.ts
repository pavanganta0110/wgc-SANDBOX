import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPartnerSession, type PartnerSession } from "@/lib/partners/partnerSession";

/**
 * For the software partner's own pages (organizations, API key, webhook, menu, billing, docs). A referral partner goes
 * to its own home. A view-only team member is let in only where the page says so (the organizations list).
 */
export async function requireSoftwarePartner(options: { allowViewer?: boolean } = {}) {
  const session = await getPartnerSession({ allowViewer: options.allowViewer });
  if (!session) redirect("/partner/login");
  if (session.partnerType === "REFERRAL") redirect("/partner/volume");
  return session;
}

/**
 * Which agent's figures a page shows. An agent's own login always gets itself. A referral partner's full-access staff
 * (or a WGC admin's read-only look) may preview one of the partner's own agents with `?asAgent=<id>`; an id that is not
 * an agent of this partner is ignored, and a view-only member can't preview.
 */
export async function resolveAgentView(session: PartnerSession, asAgent: string | undefined): Promise<{ agentId: string | null; previewName: string | null }> {
  if (session.agentId) return { agentId: session.agentId, previewName: null };
  if (!asAgent || session.partnerType !== "REFERRAL" || session.staffRole === "VIEWER") return { agentId: null, previewName: null };
  const agent = await prisma.partnerAgent.findFirst({ where: { id: asAgent, partnerId: session.partnerId }, select: { id: true, name: true } });
  return agent ? { agentId: agent.id, previewName: agent.name } : { agentId: null, previewName: null };
}
