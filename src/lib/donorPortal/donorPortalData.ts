import { prisma } from "@/lib/prisma";
import { loadDonorAggregatesBatch, EMPTY_DONOR_AGGREGATES, type DonorAggregates } from "@/lib/donors/donorAggregates";
import { findPortalDonorsByEmail } from "@/lib/donorPortal/donorAuth";

const HISTORY_LIMIT = 100;

export interface PortalTotals {
  /** Net of refunds and returns, includes gifts the church recorded by hand. */
  netDonatedCents: number;
  donationCount: number;
  /** Portion of the above the church recorded itself (cash/check/etc.), not processed by WGC. */
  recordedByChurchCents: number;
}

export interface PortalGift {
  id: string;
  date: Date | null;
  amountCents: number;
  status: string;
  fundName: string | null;
  source: "WGC" | "RECORDED_BY_CHURCH";
}

export interface PortalRecurringGift {
  id: string;
  amountCents: number | null;
  billingInterval: string | null;
  state: string | null;
  nextBillingDate: Date | null;
  fundName: string | null;
  /** What the donor chose to give, before any fee they covered — the amount the "change amount" control edits. */
  donationAmountCents: number | null;
  donorCoversFee: boolean;
  /** Pledge installments can't be changed or canceled online. */
  isPledge: boolean;
}

export interface PortalWayToGive {
  kind: "GIVING_LINK" | "CAMPAIGN";
  title: string;
  description: string | null;
  href: string;
}

function sumAggregates(list: DonorAggregates[]): DonorAggregates {
  return list.reduce(
    (acc, a) => ({
      ...acc,
      netDonatedCents: acc.netDonatedCents + a.netDonatedCents,
      donationCount: acc.donationCount + a.donationCount,
      externalDonatedCents: acc.externalDonatedCents + a.externalDonatedCents,
    }),
    { ...EMPTY_DONOR_AGGREGATES },
  );
}

function toTotals(a: DonorAggregates): PortalTotals {
  return { netDonatedCents: a.netDonatedCents, donationCount: a.donationCount, recordedByChurchCents: a.externalDonatedCents };
}

/**
 * Everything the signed-in donor may see for ONE church. Donor ids are
 * re-derived from the session donor's email inside that same church — never
 * from the request — so this can never read another church's or another
 * person's records.
 */
export async function loadDonorPortalDashboard(churchId: string, sessionDonorId: string) {
  const sessionDonor = await prisma.donor.findFirst({
    where: { id: sessionDonorId, churchId },
    select: { id: true, name: true, email: true },
  });
  if (!sessionDonor?.email) return null;

  const donors = await findPortalDonorsByEmail(churchId, sessionDonor.email);
  const donorIds = donors.map((d) => d.id);
  if (donorIds.length === 0) return null;

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));

  const [lifetimeMap, ytdMap, instruments, externalRows, subscriptions, givingLinks, campaigns, church] = await Promise.all([
    loadDonorAggregatesBatch(donorIds, churchId),
    loadDonorAggregatesBatch(donorIds, churchId, { gte: yearStart }),
    prisma.finixPaymentInstrumentSnapshot.findMany({
      where: { churchId, donorId: { in: donorIds } },
      select: { finixPaymentInstrumentId: true },
    }),
    prisma.externalDonation.findMany({
      where: { churchId, donorId: { in: donorIds }, status: { not: "VOIDED" } },
      orderBy: { donationDate: "desc" },
      take: HISTORY_LIMIT,
      select: { id: true, donationAmountCents: true, donationDate: true, fundName: true, depositStatus: true },
    }),
    prisma.finixSubscription.findMany({
      where: { churchId, donorId: { in: donorIds }, state: "ACTIVE" },
      orderBy: { createdAtFinix: "desc" },
      select: { id: true, amountCents: true, billingInterval: true, state: true, nextBillingDate: true, fundName: true, donationAmountCents: true, donorCoversFee: true, isPledge: true },
    }),
    prisma.givingLink.findMany({
      where: { churchId, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      orderBy: { createdAt: "asc" },
      select: { publicSlug: true, publicTitle: true, description: true },
    }),
    prisma.fundraisingCampaign.findMany({
      where: { churchId, status: "ACTIVE", archivedAt: null },
      orderBy: { createdAt: "desc" },
      select: { slug: true, name: true },
    }),
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true, slug: true, logoUrl: true } }),
  ]);

  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);
  const transfers = instrumentIds.length
    ? await prisma.finixTransfer.findMany({
        // Failed attempts are never shown to the donor — they're not giving, and a card-declined row is noise.
        where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: { in: ["SUCCEEDED", "PENDING"] } },
        orderBy: { createdAtFinix: "desc" },
        take: HISTORY_LIMIT,
        select: { id: true, finixTransferId: true, paymentId: true, amountCents: true, state: true, createdAtFinix: true },
      })
    : [];

  const paymentIds = transfers.map((t) => t.paymentId).filter((id): id is string => Boolean(id));
  const payments = paymentIds.length
    ? await prisma.payment.findMany({ where: { churchId, id: { in: paymentIds } }, select: { id: true, fundName: true } })
    : [];
  const fundByPaymentId = new Map(payments.map((p) => [p.id, p.fundName]));

  const gifts: PortalGift[] = [
    ...transfers.map<PortalGift>((t) => ({
      id: t.id,
      date: t.createdAtFinix,
      amountCents: t.amountCents ?? 0,
      status: (t.state ?? "UNKNOWN").toUpperCase(),
      fundName: t.paymentId ? (fundByPaymentId.get(t.paymentId) ?? null) : null,
      source: "WGC",
    })),
    ...externalRows
      .filter((e) => e.depositStatus !== "RETURNED")
      .map<PortalGift>((e) => ({
        id: e.id,
        date: e.donationDate,
        amountCents: e.donationAmountCents,
        status: "SUCCEEDED",
        fundName: e.fundName,
        source: "RECORDED_BY_CHURCH",
      })),
  ]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, HISTORY_LIMIT);

  const recurring: PortalRecurringGift[] = subscriptions.map((r) => ({ ...r, donorCoversFee: r.donorCoversFee ?? false }));

  const waysToGive: PortalWayToGive[] = [
    ...givingLinks.map<PortalWayToGive>((l) => ({ kind: "GIVING_LINK", title: l.publicTitle, description: l.description, href: `/g/${l.publicSlug}` })),
    ...campaigns.map<PortalWayToGive>((c) => ({ kind: "CAMPAIGN", title: c.name, description: null, href: `/campaign/${c.slug}` })),
  ];

  return {
    church,
    donorName: sessionDonor.name,
    lifetime: toTotals(sumAggregates([...lifetimeMap.values()])),
    yearToDate: toTotals(sumAggregates([...ytdMap.values()])),
    gifts,
    recurring,
    waysToGive,
  };
}
