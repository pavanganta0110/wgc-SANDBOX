import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { sendWgcEmail } from "@/lib/email";
import { isValidEmail } from "@/lib/donors/donorContact";

const MAX_AGENTS = 200;
const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export class AddAgentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * A referral partner adds one of its own agents (from the Team page or its API key). The partner comes from the
 * signed-in session or the authenticated key, never from the request. WGC is emailed so it can set the agent's rate,
 * which stays the default until then. A failed email never fails the add.
 */
export async function addPartnerAgent(params: { partnerId: string; name: unknown; email: unknown; actor: string; via: "dashboard" | "api" }) {
  const name = typeof params.name === "string" ? params.name.trim().slice(0, 120) : "";
  const email = typeof params.email === "string" ? params.email.trim().toLowerCase().slice(0, 200) : "";
  if (!name) throw new AddAgentError("Enter the agent's name.", 400);
  if (email && !isValidEmail(email)) throw new AddAgentError("Enter a valid email address.", 400);

  const partner = await prisma.partner.findUnique({ where: { id: params.partnerId }, select: { name: true, partnerType: true, status: true } });
  if (!partner || partner.partnerType !== "REFERRAL") throw new AddAgentError("Only a referral partner has agents.", 400);
  if (partner.status !== "ACTIVE") throw new AddAgentError("This partner is suspended.", 409);
  if ((await prisma.partnerAgent.count({ where: { partnerId: params.partnerId } })) >= MAX_AGENTS) throw new AddAgentError("Too many agents.", 409);

  const agent = await prisma.partnerAgent.create({ data: { partnerId: params.partnerId, name, email: email || null } });
  await createAuditLog({ action: "PARTNER_AGENT_ADDED", actorEmail: params.actor, metadata: { partnerId: params.partnerId, agentId: agent.id, name, by: "partner", via: params.via } });

  try {
    await sendWgcEmail({
      to: process.env.SUPPORT_EMAIL || "support@wgcpayments.com",
      subject: `${partner.name} added an agent: ${name}`,
      title: "New partner agent",
      badgeText: "Partner agent",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p><strong>${escapeHtml(partner.name)}</strong> added the agent <strong>${escapeHtml(name)}</strong>${email ? ` (${escapeHtml(email)})` : ""} ${params.via === "api" ? "through its API key" : "from its Team page"}.</p>
                 <p>The agent starts at the default rate. Set their real rate on the partner's Volume and revenue page if it should differ.</p>`,
    });
  } catch (err) {
    console.error("addPartnerAgent: WGC notification failed:", err);
  }
  return { id: agent.id, name, email: email || null };
}
