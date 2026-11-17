import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { requestedItemsList, STAGE_LABELS, type OnboardingStage } from "./onboardingStages";

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type ReferralEmailStage = Extract<OnboardingStage, "submitted" | "under_review" | "information_required" | "approved" | "rejected"> | "information_submitted";

const COPY: Record<ReferralEmailStage, { verb: string; badge: string; color: string; next: string }> = {
  submitted: { verb: "submitted their application", badge: "Submitted", color: "#0B5DBC", next: "WGC is reviewing it. You will be emailed at each step." },
  under_review: { verb: "is under review", badge: "Under review", color: "#0B5DBC", next: "WGC and our processor are reviewing the application." },
  information_required: { verb: "needs to send more information", badge: "Information required", color: "#F59E0B", next: "We emailed the organization a secure link to send it. Please nudge them to finish it so the application can move forward." },
  information_submitted: { verb: "sent the information that was missing", badge: "Back under review", color: "#0B5DBC", next: "The application is back under review." },
  approved: { verb: "was approved", badge: "Approved", color: "#16A34A", next: "They can start accepting payments." },
  rejected: { verb: "was not approved", badge: "Not approved", color: "#EF4444", next: "Contact WGC support if you have questions." },
};

/**
 * Emails a referral partner's people when an application it brought in changes stage: the agent who brought it in
 * (their login email, or the email WGC has for them) and the partner's own full-access staff and contact. A software
 * partner is told through its webhook instead, so nothing is sent for one. Never carries the organization's one-time
 * upload link. Never throws, and a failed send is logged, not raised.
 */
export async function emailReferralTeamOfStage(applicationId: string, stage: ReferralEmailStage): Promise<void> {
  try {
    const app = await prisma.onboardingApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, partnerId: true, partnerAgentId: true, organizationName: true, legalBusinessName: true, updateRequestedItems: true },
    });
    if (!app?.partnerId) return;
    const partner = await prisma.partner.findUnique({ where: { id: app.partnerId }, select: { name: true, partnerType: true, status: true, contactEmail: true } });
    if (!partner || partner.partnerType !== "REFERRAL" || partner.status !== "ACTIVE") return;

    const [agent, users] = await Promise.all([
      app.partnerAgentId ? prisma.partnerAgent.findFirst({ where: { id: app.partnerAgentId, partnerId: app.partnerId }, select: { name: true, email: true } }) : null,
      prisma.partnerUser.findMany({ where: { partnerId: app.partnerId, disabledAt: null, passwordHash: { not: null } }, select: { email: true, agentId: true, staffRole: true } }),
    ]);

    const recipients = new Set<string>();
    if (agent?.email) recipients.add(agent.email.toLowerCase());
    for (const u of users) {
      if (u.agentId) {
        if (u.agentId === app.partnerAgentId) recipients.add(u.email.toLowerCase());
      } else if (u.staffRole !== "VIEWER") recipients.add(u.email.toLowerCase());
    }
    if (partner.contactEmail) recipients.add(partner.contactEmail.toLowerCase());
    if (recipients.size === 0) return;

    const org = escapeHtml(app.legalBusinessName || app.organizationName || "An organization");
    const c = COPY[stage];
    const items = stage === "information_required" ? requestedItemsList(app.updateRequestedItems) : [];
    const subject = `${app.legalBusinessName || app.organizationName || "An organization"} ${c.verb}`;
    const bodyHtml = `<p><strong>${org}</strong> ${c.verb}.</p>
      ${agent ? `<p>Brought in by <strong>${escapeHtml(agent.name)}</strong>.</p>` : ""}
      ${items.length ? `<p><strong>What Finix asked for:</strong></p><ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join("")}</ul>` : ""}
      <p>${c.next}</p>
      <p><a href="${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/partner/applications">See your applications</a></p>`;

    for (const to of recipients) {
      const result = await sendWgcEmail({ to, subject, title: `Application: ${STAGE_LABELS[stage === "information_submitted" ? "under_review" : stage]}`, badgeText: c.badge, badgeColor: c.color, bodyHtml });
      await prisma.emailLog
        .create({
          data: {
            onboardingApplicationId: app.id,
            type: "PARTNER_APPLICATION_STAGE",
            to,
            subject,
            status: result.success ? "SENT" : "ERROR",
            sentAt: result.success ? new Date() : null,
            error: result.success ? null : String(result.error ?? "unknown error"),
            bodyHtml,
          },
        })
        .catch(() => {});
    }
  } catch (err) {
    console.error(`emailReferralTeamOfStage failed for application=${applicationId}:`, err);
  }
}
