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
  /** The public title of the giving link the donor gave through; null for gifts with none (e.g. recorded by the church). */
  givingLinkTitle: string | null;
  /** Which receipt to download, when this gift has one. Completed gifts only. */
  receipt: { kind: "payment" | "external"; id: string } | null;
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

export interface PortalStatement {
  id: string;
  taxYear: number;
  eligibleAmountCents: number;
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

  // The two aggregate loaders each fan out into many queries; run back to back so one page view
  // can't exhaust the pooled database connections (the Donors page documents the same failure).
  const lifetimeMap = await loadDonorAggregatesBatch(donorIds, churchId);
  const ytdMap = await loadDonorAggregatesBatch(donorIds, churchId, { gte: yearStart });

  const [instruments, externalRows, subscriptions, givingLinks, campaigns, church, statementRows] = await Promise.all([
    prisma.finixPaymentInstrumentSnapshot.findMany({
      where: { churchId, donorId: { in: donorIds } },
      select: { finixPaymentInstrumentId: true },
    }),
    prisma.externalDonation.findMany({
      where: { churchId, donorId: { in: donorIds }, status: { not: "VOIDED" } },
      orderBy: { donationDate: "desc" },
      take: HISTORY_LIMIT,
      select: { id: true, donationAmountCents: true, donationDate: true, fundName: true, depositStatus: true, isAnonymous: true },
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
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true, slug: true, logoUrl: true, primaryColor: true } }),
    // Only statements the church itself has already generated — a donor can't trigger generation, so the church's review step is never bypassed.
    prisma.annualDonationStatement.findMany({
      where: { churchId, donorId: { in: donorIds }, statementStatus: { in: ["READY", "GENERATED"] }, supersededAt: null, generatedAt: { not: null }, eligibleAmountCents: { gt: 0 } },
      orderBy: { taxYear: "desc" },
      select: { id: true, taxYear: true, eligibleAmountCents: true },
    }),
  ]);

  const instrumentIds = instruments.map((i) => i.finixPaymentInstrumentId);
  const transfers = instrumentIds.length
    ? await prisma.finixTransfer.findMany({
        // Failed attempts are never shown to the donor — they're not giving, and a card-declined row is noise.
        where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: { in: ["SUCCEEDED", "PENDING"] } },
        orderBy: { createdAtFinix: "desc" },
        take: HISTORY_LIMIT,
        select: { id: true, finixTransferId: true, paymentId: true, finixSubscriptionId: true, amountCents: true, state: true, createdAtFinix: true },
      })
    : [];

  // A transfer reaches its payment by id or by transfer id (same two paths the donor aggregates use); recurring
  // charges may only carry the subscription, which knows its giving link.
  const paymentIds = transfers.map((t) => t.paymentId).filter((id): id is string => Boolean(id));
  const transferIds = transfers.map((t) => t.finixTransferId);
  const subscriptionIds = [...new Set(transfers.map((t) => t.finixSubscriptionId).filter((id): id is string => Boolean(id)))];
  const payments = transfers.length
    ? await prisma.payment.findMany({
        where: { churchId, OR: [{ id: { in: paymentIds } }, { finixTransferId: { in: transferIds } }] },
        select: { id: true, finixTransferId: true, fundName: true, givingLinkId: true },
      })
    : [];
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const paymentByTransferId = new Map(payments.filter((p) => p.finixTransferId).map((p) => [p.finixTransferId as string, p]));
  const subscriptionRows = subscriptionIds.length
    ? await prisma.finixSubscription.findMany({ where: { churchId, finixSubscriptionId: { in: subscriptionIds } }, select: { finixSubscriptionId: true, givingLinkId: true, fundName: true } })
    : [];
  const subscriptionById = new Map(subscriptionRows.map((r) => [r.finixSubscriptionId, r]));

  const linkIds = new Set<string>();
  for (const p of payments) if (p.givingLinkId) linkIds.add(p.givingLinkId);
  for (const r of subscriptionRows) if (r.givingLinkId) linkIds.add(r.givingLinkId);
  const linkRows = linkIds.size
    ? await prisma.givingLink.findMany({ where: { churchId, id: { in: [...linkIds] } }, select: { id: true, publicTitle: true } })
    : [];
  const titleByLinkId = new Map(linkRows.map((l) => [l.id, l.publicTitle]));

  const resolveTransfer = (t: (typeof transfers)[number]) => {
    const payment = (t.paymentId ? paymentById.get(t.paymentId) : undefined) ?? paymentByTransferId.get(t.finixTransferId);
    const subscription = t.finixSubscriptionId ? subscriptionById.get(t.finixSubscriptionId) : undefined;
    const linkId = payment?.givingLinkId ?? subscription?.givingLinkId ?? null;
    const completed = (t.state ?? "").toUpperCase() === "SUCCEEDED";
    return {
      fundName: payment?.fundName ?? subscription?.fundName ?? null,
      givingLinkTitle: linkId ? (titleByLinkId.get(linkId) ?? null) : null,
      // A receipt needs the WGC payment row it is built from; a bare processor transfer has none.
      receipt: payment && completed ? { kind: "payment" as const, id: payment.id } : null,
    };
  };

  const gifts: PortalGift[] = [
    ...transfers.map<PortalGift>((t) => ({
      id: t.id,
      date: t.createdAtFinix,
      amountCents: t.amountCents ?? 0,
      status: (t.state ?? "UNKNOWN").toUpperCase(),
      ...resolveTransfer(t),
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
        givingLinkTitle: null,
        // An anonymous gift has no donor identity to put on a receipt.
        receipt: e.isAnonymous ? null : { kind: "external" as const, id: e.id },
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

  const statements: PortalStatement[] = statementRows;

  return {
    church,
    donorName: sessionDonor.name,
    lifetime: toTotals(sumAggregates([...lifetimeMap.values()])),
    yearToDate: toTotals(sumAggregates([...ytdMap.values()])),
    gifts,
    recurring,
    statements,
    waysToGive,
  };
}
