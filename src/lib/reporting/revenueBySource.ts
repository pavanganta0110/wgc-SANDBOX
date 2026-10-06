import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type RevenueSourceKey = "EVENTS" | "CAMPAIGNS" | "GIVING_PAGES" | "OTHER";

export interface RevenueSourceRow {
  key: RevenueSourceKey;
  label: string;
  count: number;
  grossCents: number;
}

export interface RevenueBySource {
  rows: RevenueSourceRow[];
  totalCents: number;
  totalCount: number;
}

const LABELS: Record<RevenueSourceKey, string> = {
  EVENTS: "Events",
  CAMPAIGNS: "Fundraising campaigns",
  GIVING_PAGES: "Giving pages",
  OTHER: "Other (Take a Payment, invoices, etc.)",
};

/**
 * Splits succeeded payments by where the money came from, so the Payments
 * dashboard shows event revenue, fundraising-campaign revenue and giving-page
 * revenue side by side. Classification is by Payment.givingLinkId (every
 * event, campaign, team and fundraiser owns a dedicated GivingLink) plus
 * EventRegistration.paymentId; anything else with a giving link is a plain
 * giving page. `scope` must come from buildPaymentScope — never a client value.
 */
export const SOURCE_LABELS = LABELS;
export const SOURCE_KEYS = Object.keys(LABELS) as RevenueSourceKey[];

export type PaymentSourceClassifier = (p: { id: string; givingLinkId: string | null }) => RevenueSourceKey;

export async function buildSourceClassifier(churchId: string): Promise<PaymentSourceClassifier> {
  const [events, campaigns, teams, fundraisers, registrations] = await Promise.all([
    prisma.event.findMany({ where: { churchId, givingLinkId: { not: null } }, select: { givingLinkId: true } }),
    prisma.fundraisingCampaign.findMany({ where: { churchId, givingLinkId: { not: null } }, select: { givingLinkId: true } }),
    prisma.campaignTeam.findMany({ where: { campaign: { churchId }, givingLinkId: { not: null } }, select: { givingLinkId: true } }),
    prisma.campaignFundraiser.findMany({ where: { campaign: { churchId }, givingLinkId: { not: null } }, select: { givingLinkId: true } }),
    prisma.eventRegistration.findMany({ where: { churchId, paymentId: { not: null } }, select: { paymentId: true } }),
  ]);
  const ids = (list: { givingLinkId: string | null }[]) =>
    new Set(list.map((r) => r.givingLinkId).filter((v): v is string => Boolean(v)));
  const eventLinks = ids(events);
  const campaignLinks = new Set([...ids(campaigns), ...ids(teams), ...ids(fundraisers)]);
  const eventPaymentIds = new Set(registrations.map((r) => r.paymentId as string));
  return (p) => {
    if (eventPaymentIds.has(p.id) || (p.givingLinkId && eventLinks.has(p.givingLinkId))) return "EVENTS";
    if (p.givingLinkId && campaignLinks.has(p.givingLinkId)) return "CAMPAIGNS";
    if (p.givingLinkId) return "GIVING_PAGES";
    return "OTHER";
  };
}

export async function getRevenueBySource(
  scope: Prisma.PaymentWhereInput,
  churchId: string,
  dateFilter?: { gte: Date; lte?: Date },
): Promise<RevenueBySource> {
  const [payments, classify] = await Promise.all([
    prisma.payment.findMany({
      where: { ...scope, status: "SUCCEEDED", ...(dateFilter ? { createdAt: dateFilter } : {}) },
      select: { id: true, givingLinkId: true, amountCents: true },
    }),
    buildSourceClassifier(churchId),
  ]);
  const totals: Record<RevenueSourceKey, { count: number; grossCents: number }> = {
    EVENTS: { count: 0, grossCents: 0 },
    CAMPAIGNS: { count: 0, grossCents: 0 },
    GIVING_PAGES: { count: 0, grossCents: 0 },
    OTHER: { count: 0, grossCents: 0 },
  };
  for (const p of payments) {
    const key = classify(p);
    totals[key].count += 1;
    totals[key].grossCents += p.amountCents;
  }
  const rows = SOURCE_KEYS.map((key) => ({ key, label: LABELS[key], ...totals[key] }));
  return {
    rows,
    totalCents: rows.reduce((s, r) => s + r.grossCents, 0),
    totalCount: rows.reduce((s, r) => s + r.count, 0),
  };
}
