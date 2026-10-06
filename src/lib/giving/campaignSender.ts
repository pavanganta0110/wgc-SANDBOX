import { prisma } from "@/lib/prisma";
import { renderCampaignTemplate } from "@/lib/giving/campaignTemplate";
import { sendWgcEmail } from "@/lib/email";
import { sendText } from "@/lib/sms/sendText";
import { isEmailOptedOut } from "@/lib/giving/emailOptOut";
import { loadCampaignEventVars } from "@/lib/giving/campaignEventVars";
import { escapeHtml } from "@/lib/eventRegistration/emailTemplates";

/**
 * Sends one small batch of a Giving Campaign's pending recipients. Shared by
 * the merchant's "Send" button (which calls it repeatedly from the browser)
 * and the monthly cron (which loops it server-side) so both behave
 * identically: same templates, same branding, same unsubscribe handling.
 *
 * Every email carries a one-click Unsubscribe link and List-Unsubscribe
 * headers, and an address that has unsubscribed is skipped — checked here at
 * send time as well as when the audience was built, so an unsubscribe that
 * lands mid-send still holds.
 */

export const SEND_CHUNK_SIZE = 5;

export interface CampaignChunkResult {
  done: boolean;
  processed: number;
  remaining: number;
  sent: number;
  failed: number;
  campaign: NonNullable<Awaited<ReturnType<typeof prisma.givingCampaign.findFirst>>>;
}

export function unsubscribeFooterHtml(organizationName: string, unsubscribeUrl: string): string {
  return `<p style="margin:28px 0 0 0;padding-top:14px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#94a3b8;">You're receiving this email from ${escapeHtml(organizationName)}. If you'd rather not hear from us by email, you can <a href="${escapeHtml(unsubscribeUrl)}" style="color:#94a3b8;text-decoration:underline;">unsubscribe</a>.</p>`;
}

export async function sendCampaignChunk(params: { campaignId: string; churchId: string; actorUserId: string | null }): Promise<CampaignChunkResult | null> {
  const { campaignId, churchId, actorUserId } = params;
  const campaign = await prisma.givingCampaign.findFirst({ where: { id: campaignId, churchId } });
  if (!campaign) return null;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { name: true, logoUrl: true, primaryColor: true, statementSenderName: true },
  });
  const churchName = church?.name || "Your Organization";
  const senderName = church?.statementSenderName || churchName;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

  const eventVars = campaign.eventId ? await loadCampaignEventVars(churchId, campaign.eventId) : null;

  const pending = await prisma.givingCampaignRecipient.findMany({
    where: { campaignId: campaign.id, churchId, sendStatus: "PENDING" },
    take: SEND_CHUNK_SIZE,
  });

  if (campaign.status === "DRAFT" && pending.length > 0) {
    await prisma.givingCampaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });
  }

  let sent = 0;
  let failed = 0;
  for (const recipient of pending) {
    const vars = {
      firstName: recipient.recipientName?.split(" ")[0] || "there",
      churchName,
      link: `${appUrl}/gc/${recipient.trackingToken}`,
      ...(eventVars ? { eventName: eventVars.eventName, eventDate: eventVars.eventDate, eventTime: eventVars.eventTime, eventLocation: eventVars.eventLocation } : {}),
    };

    let result: { success: boolean; error?: string };

    if (campaign.channel === "TEXT") {
      if (!recipient.recipientPhone) {
        await prisma.givingCampaignRecipient.update({ where: { id: recipient.id }, data: { sendStatus: "FAILED", sendError: "No phone number on file" } });
        failed++;
        continue;
      }
      result = await sendText(recipient.recipientPhone, renderCampaignTemplate(campaign.textBodyTemplate || "", vars));
    } else {
      if (!recipient.recipientEmail) {
        await prisma.givingCampaignRecipient.update({ where: { id: recipient.id }, data: { sendStatus: "FAILED", sendError: "No email on file" } });
        failed++;
        continue;
      }
      if (await isEmailOptedOut(churchId, recipient.recipientEmail)) {
        await prisma.givingCampaignRecipient.update({ where: { id: recipient.id }, data: { sendStatus: "SKIPPED", sendError: "Unsubscribed" } });
        continue;
      }
      const subject = renderCampaignTemplate(campaign.emailSubject || "", vars);
      const unsubscribePage = `${appUrl}/unsubscribe/${recipient.trackingToken}`;
      const bodyHtml = renderCampaignTemplate(campaign.emailBodyTemplate || "", vars) + unsubscribeFooterHtml(churchName, unsubscribePage);
      result = await sendWgcEmail({
        to: recipient.recipientEmail,
        subject,
        title: subject,
        badgeText: `A message from ${churchName}`,
        badgeColor: church?.primaryColor || "#0B5DBC",
        bodyHtml,
        // Church-branded, not WGC-branded — this is the church reaching
        // out to its own donor (see Settings -> Branding / Receipts &
        // Annual Statements for where each of these is set).
        logoUrl: church?.logoUrl || undefined,
        logoAlt: churchName,
        senderName,
        headers: {
          "List-Unsubscribe": `<${appUrl}/api/unsubscribe/${recipient.trackingToken}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        log: {
          churchId,
          donorId: recipient.donorId,
          recipientName: recipient.recipientName,
          category: "MERCHANT_NOTIFICATION",
          relatedEntityType: "GivingCampaignRecipient",
          relatedEntityId: recipient.id,
          createdByUserId: actorUserId,
        },
      });
    }

    if (result.success) sent++;
    else failed++;
    await prisma.givingCampaignRecipient.update({
      where: { id: recipient.id },
      data: result.success
        ? { sendStatus: "SENT", sentAt: new Date() }
        : { sendStatus: "FAILED", sendError: result.error ? String(result.error) : "Send failed" },
    });
  }

  const remaining = await prisma.givingCampaignRecipient.count({ where: { campaignId: campaign.id, churchId, sendStatus: "PENDING" } });
  const done = remaining === 0;
  const updated = done ? await prisma.givingCampaign.update({ where: { id: campaign.id }, data: { status: "SENT", sentAt: new Date() } }) : campaign;

  return { done, processed: pending.length, remaining, sent, failed, campaign: updated };
}
