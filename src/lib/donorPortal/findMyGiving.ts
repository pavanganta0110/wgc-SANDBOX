import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/eventRegistration/emailTemplates";
import { normalizeEmail } from "@/lib/donors/donorContact";
import { donorPortalUrl } from "@/lib/donorPortal/portalLink";

const MAX_ORGANIZATIONS = 20;

export interface GivingPortalLink {
  name: string;
  slug: string;
}

/**
 * Every live organization that has this email on an active donor record. Only
 * ever used to build an email to that same address — the result is never
 * returned to the (unauthenticated) caller, so the page can't be used to learn
 * where someone gives.
 */
export async function findGivingPortalsByEmail(email: string): Promise<GivingPortalLink[]> {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const donors = await prisma.donor.findMany({
    where: {
      archivedAt: null,
      mergedIntoDonorId: null,
      // Older rows can have `email` without a backfilled `normalizedEmail`.
      OR: [{ normalizedEmail: normalized }, { normalizedEmail: null, email: { equals: normalized, mode: "insensitive" } }],
    },
    select: { churchId: true },
    take: 500,
  });
  const churchIds = [...new Set(donors.map((d) => d.churchId))];
  if (churchIds.length === 0) return [];

  return prisma.church.findMany({
    where: { id: { in: churchIds }, finixMerchantId: { not: null } },
    orderBy: { name: "asc" },
    take: MAX_ORGANIZATIONS,
    select: { name: true, slug: true },
  });
}

/** Emails the address a list of portal links, one per organization. Sends nothing when there is no match. */
export async function sendFindMyGivingEmail(email: string): Promise<{ sent: boolean }> {
  const orgs = await findGivingPortalsByEmail(email);
  if (orgs.length === 0) return { sent: false };

  const items = orgs
    .map((o) => `<li style="margin:0 0 10px 0;"><a href="${donorPortalUrl(o.slug)}" style="color:#0f172a;font-weight:600;">${escapeHtml(o.name)}</a></li>`)
    .join("");

  const res = await sendWgcEmail({
    to: email.trim(),
    subject: orgs.length === 1 ? `Your giving to ${orgs[0].name}` : "Where to see your giving",
    title: "See Your Giving",
    badgeText: "Giving Portal",
    bodyHtml: `
      <p>You asked how to see your giving. Choose an organization to sign in — we'll email you a one-time code, so there's no password to remember.</p>
      <ul style="padding-left:18px;margin:16px 0;">${items}</ul>
      <p style="font-size:12px;color:#94a3b8;">If you didn't ask for this, you can ignore this email — nobody can see your giving without a code sent to this address.</p>
    `,
  });
  return { sent: Boolean(res?.success) };
}
