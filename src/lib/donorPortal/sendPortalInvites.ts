import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/eventRegistration/emailTemplates";
import { isValidEmail, normalizeEmail } from "@/lib/donors/donorContact";
import { loadOptedOutEmails } from "@/lib/giving/emailOptOut";
import { resolvePortalAccent } from "@/lib/donorPortal/portalBrand";

export const INVITE_RELATED_ENTITY_TYPE = "DONOR_PORTAL_INVITE";
/** One request never sends more than this — keeps a single serverless call well inside its time limit; the caller is told how many are left. */
export const MAX_INVITES_PER_REQUEST = 200;
const SEND_CHUNK_SIZE = 10;

export interface InviteRecipient {
  donorId: string | null;
  email: string | null;
  name: string | null;
}

export interface InviteResult {
  sent: number;
  failed: number;
  skipped: { noEmail: number; optedOut: number; recentlyInvited: number; duplicate: number };
  /** Eligible recipients not sent because of the per-request cap. */
  remaining: number;
}

export interface SendInvitesParams {
  churchId: string;
  actorUserId: string | null;
  recipients: InviteRecipient[];
  /** Don't re-invite someone we already invited within this window. */
  throttleMs: number;
  /** Count and filter only — sends nothing. */
  dryRun?: boolean;
}

function absoluteUrl(appUrl: string, url: string | null): string | undefined {
  if (!url) return undefined;
  return url.startsWith("http") ? url : `${appUrl}${url.startsWith("/") ? "" : "/"}${url}`;
}

function firstName(name: string | null): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "there";
}

/**
 * Emails donors a link to the organization's donor portal. The email carries
 * only the portal page address — never a sign-in credential — so a forwarded
 * invite opens nothing: the recipient still has to prove the email with a
 * one-time code. Addresses that unsubscribed from this church's email are
 * skipped, repeat invites inside `throttleMs` are skipped, and every send is
 * written to the church's email log.
 */
export async function sendDonorPortalInvites(params: SendInvitesParams): Promise<InviteResult> {
  const { churchId, actorUserId, recipients, throttleMs, dryRun } = params;
  const result: InviteResult = { sent: 0, failed: 0, skipped: { noEmail: 0, optedOut: 0, recentlyInvited: 0, duplicate: 0 }, remaining: 0 };

  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { name: true, slug: true, logoUrl: true, primaryColor: true, givingSupportEmail: true, primaryContactEmail: true },
  });
  if (!church) throw new Error("Organization not found");

  // 1. Needs a usable email, once per address.
  const seen = new Set<string>();
  const candidates: (InviteRecipient & { email: string; normalized: string })[] = [];
  for (const r of recipients) {
    const normalized = normalizeEmail(r.email);
    if (!r.email || !normalized || !isValidEmail(r.email)) { result.skipped.noEmail++; continue; }
    if (seen.has(normalized)) { result.skipped.duplicate++; continue; }
    seen.add(normalized);
    candidates.push({ ...r, email: r.email.trim(), normalized });
  }

  // 2. Unsubscribed from this organization, and recently invited — one query each for the whole list.
  const optedOut = await loadOptedOutEmails(churchId, candidates.map((c) => c.email));
  const recent = await prisma.orgEmailLog.findMany({
    where: { churchId, relatedEntityType: INVITE_RELATED_ENTITY_TYPE, status: "SENT", createdAt: { gte: new Date(Date.now() - throttleMs) } },
    select: { recipientEmail: true },
  });
  const recentlyInvited = new Set(recent.map((r) => normalizeEmail(r.recipientEmail)).filter((e): e is string => Boolean(e)));

  const eligible = candidates.filter((c) => {
    if (optedOut.has(c.normalized)) { result.skipped.optedOut++; return false; }
    if (recentlyInvited.has(c.normalized)) { result.skipped.recentlyInvited++; return false; }
    return true;
  });

  const batch = eligible.slice(0, MAX_INVITES_PER_REQUEST);
  result.remaining = eligible.length - batch.length;
  if (dryRun) {
    result.sent = batch.length;
    return result;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const portalUrl = `${appUrl}/give/${church.slug}/account`;
  const accent = resolvePortalAccent(church.primaryColor);
  const orgName = escapeHtml(church.name);
  const replyTo = church.givingSupportEmail || church.primaryContactEmail || undefined;

  for (let i = 0; i < batch.length; i += SEND_CHUNK_SIZE) {
    const outcomes = await Promise.all(
      batch.slice(i, i + SEND_CHUNK_SIZE).map(async (r) => {
        try {
          const res = await sendWgcEmail({
            to: r.email,
            subject: `See and manage your giving to ${church.name}`,
            title: "Your Giving Portal",
            badgeText: "Giving Portal",
            badgeColor: accent,
            logoUrl: absoluteUrl(appUrl, church.logoUrl),
            logoAlt: church.name,
            senderName: church.name,
            replyTo,
            bodyHtml: `
              <p>Hi ${escapeHtml(firstName(r.name))},</p>
              <p>${orgName} has a giving portal where you can see your gifts, download your giving statements, and manage your recurring gifts.</p>
              <p><a href="${portalUrl}" style="display:inline-block;padding:12px 24px;background:${accent};color:#fff;border-radius:8px;text-decoration:none;">View my giving</a></p>
              <p style="font-size:13px;color:#64748b;">To sign in, enter this email address (${escapeHtml(r.email)}). We'll send you a one-time code — there's no password to remember.</p>
              <p style="margin:24px 0 0 0;padding-top:12px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">Don't want messages like this from ${orgName}? Reply to this email and they'll stop.</p>
            `,
            log: {
              churchId,
              donorId: r.donorId,
              recipientName: r.name,
              category: "OTHER",
              relatedEntityType: INVITE_RELATED_ENTITY_TYPE,
              relatedEntityId: r.donorId,
              createdByUserId: actorUserId,
            },
          });
          return Boolean(res?.success);
        } catch (err) {
          console.error("Donor portal invite failed:", err);
          return false;
        }
      }),
    );
    for (const ok of outcomes) {
      if (ok) result.sent++;
      else result.failed++;
    }
  }

  return result;
}
