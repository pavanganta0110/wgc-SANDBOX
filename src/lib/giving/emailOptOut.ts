import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/donors/donorContact";

/**
 * Per-church bulk-email opt-outs (the Unsubscribe link in Giving Campaign
 * emails). An address opting out of one organization never affects another.
 */

export async function isEmailOptedOut(churchId: string, email: string | null | undefined): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const row = await prisma.emailOptOut.findUnique({ where: { churchId_normalizedEmail: { churchId, normalizedEmail: normalized } }, select: { id: true } });
  return Boolean(row);
}

/** The subset of `emails` that have opted out of this church — one query for a whole audience. */
export async function loadOptedOutEmails(churchId: string, emails: (string | null | undefined)[]): Promise<Set<string>> {
  const normalized = [...new Set(emails.map((e) => normalizeEmail(e)).filter((e): e is string => Boolean(e)))];
  if (normalized.length === 0) return new Set();
  const out = new Set<string>();
  // Chunked so a very large audience never builds an enormous IN list.
  for (let i = 0; i < normalized.length; i += 5000) {
    const rows = await prisma.emailOptOut.findMany({ where: { churchId, normalizedEmail: { in: normalized.slice(i, i + 5000) } }, select: { normalizedEmail: true } });
    for (const r of rows) out.add(r.normalizedEmail);
  }
  return out;
}

export async function recordEmailOptOut(churchId: string, email: string, campaignId?: string | null): Promise<void> {
  const normalized = normalizeEmail(email);
  if (!normalized) return;
  await prisma.emailOptOut.upsert({
    where: { churchId_normalizedEmail: { churchId, normalizedEmail: normalized } },
    create: { churchId, normalizedEmail: normalized, campaignId: campaignId ?? null },
    update: {},
  });
}
