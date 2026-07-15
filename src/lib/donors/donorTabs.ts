import { prisma } from "@/lib/prisma";

/** Every tab resolves the donor's instrument IDs the same way — computed once per request, not per tab. */
export async function loadDonorInstrumentIds(donorId: string, churchId: string) {
  const instruments = await prisma.finixPaymentInstrumentSnapshot.findMany({
    where: { churchId, donorId },
    orderBy: { updatedAtFinix: "desc" },
  });
  return { instruments, instrumentIds: instruments.map((i) => i.finixPaymentInstrumentId) };
}

export interface DonationsTabFilters {
  state?: string;
  refunded?: boolean;
  disputed?: boolean;
  minAmountCents?: number;
  maxAmountCents?: number;
  paymentMethod?: "card" | "bank";
  createdDateFilter?: { gte: Date; lte?: Date };
}

export async function loadDonorDonationsTab(
  instrumentIds: string[],
  churchId: string,
  filters: DonationsTabFilters,
  page: number,
  pageSize: number,
) {
  if (instrumentIds.length === 0) return { rows: [], totalCount: 0 };

  const transfers = await prisma.finixTransfer.findMany({
    where: {
      churchId,
      finixPaymentInstrumentId: { in: instrumentIds },
      ...(filters.state ? { state: filters.state } : {}),
      ...(filters.createdDateFilter ? { createdAtFinix: filters.createdDateFilter } : {}),
      ...(filters.minAmountCents != null || filters.maxAmountCents != null
        ? { amountCents: { ...(filters.minAmountCents != null ? { gte: filters.minAmountCents } : {}), ...(filters.maxAmountCents != null ? { lte: filters.maxAmountCents } : {}) } }
        : {}),
    },
    orderBy: { createdAtFinix: "desc" },
  });

  const transferIds = transfers.map((t) => t.finixTransferId);
  const [refunds, bankReturns, disputes, payments] = await Promise.all([
    transferIds.length ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.finixDispute.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.payment.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : Promise.resolve([]),
  ]);

  const refundsByTransfer = new Map<string, typeof refunds>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    const list = refundsByTransfer.get(r.finixOriginalTransferId) ?? [];
    list.push(r);
    refundsByTransfer.set(r.finixOriginalTransferId, list);
  }
  const returnsByTransfer = new Map<string, (typeof bankReturns)[number]>();
  for (const r of bankReturns) {
    if (r.originalTransferId) returnsByTransfer.set(r.originalTransferId, r);
  }
  const disputesByTransfer = new Map<string, (typeof disputes)[number]>();
  for (const d of disputes) {
    if (d.finixTransferId) disputesByTransfer.set(d.finixTransferId, d);
  }
  const paymentsByTransfer = new Map(payments.map((p) => [p.finixTransferId!, p]));

  let rows = transfers.map((t) => ({
    transfer: t,
    refunds: refundsByTransfer.get(t.finixTransferId) ?? [],
    bankReturn: returnsByTransfer.get(t.finixTransferId) ?? null,
    dispute: disputesByTransfer.get(t.finixTransferId) ?? null,
    payment: paymentsByTransfer.get(t.finixTransferId) ?? null,
  }));

  if (filters.refunded) rows = rows.filter((r) => r.refunds.length > 0);
  if (filters.disputed) rows = rows.filter((r) => r.dispute !== null);

  const totalCount = rows.length;
  const paged = rows.slice((page - 1) * pageSize, page * pageSize);
  return { rows: paged, totalCount };
}

export async function loadDonorRecurringTab(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];
  return prisma.finixSubscription.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    orderBy: { createdAtFinix: "desc" },
  });
}

export async function loadDonorGivingLinksTab(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, state: "SUCCEEDED" },
    select: { finixTransferId: true, amountCents: true, createdAtFinix: true },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);
  const transferById = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const payments = transferIds.length
    ? await prisma.payment.findMany({
        where: { churchId, finixTransferId: { in: transferIds }, givingLinkId: { not: null } },
        select: { finixTransferId: true, givingLinkId: true, status: true, createdAt: true },
      })
    : [];

  const byLink = new Map<string, { attempts: number; successful: number; totalCents: number; firstUsed: Date | null; lastUsed: Date | null; recurringCreated: number }>();
  for (const p of payments) {
    if (!p.givingLinkId) continue;
    const entry = byLink.get(p.givingLinkId) ?? { attempts: 0, successful: 0, totalCents: 0, firstUsed: null, lastUsed: null, recurringCreated: 0 };
    entry.attempts += 1;
    const transfer = p.finixTransferId ? transferById.get(p.finixTransferId) : undefined;
    if (transfer) {
      entry.successful += 1;
      entry.totalCents += transfer.amountCents ?? 0;
      const at = transfer.createdAtFinix;
      if (at && (!entry.firstUsed || at < entry.firstUsed)) entry.firstUsed = at;
      if (at && (!entry.lastUsed || at > entry.lastUsed)) entry.lastUsed = at;
    }
    byLink.set(p.givingLinkId, entry);
  }

  const subs = await prisma.finixSubscription.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds }, givingLinkId: { not: null } },
    select: { givingLinkId: true },
  });
  for (const s of subs) {
    if (!s.givingLinkId) continue;
    const entry = byLink.get(s.givingLinkId) ?? { attempts: 0, successful: 0, totalCents: 0, firstUsed: null, lastUsed: null, recurringCreated: 0 };
    entry.recurringCreated += 1;
    byLink.set(s.givingLinkId, entry);
  }

  if (byLink.size === 0) return [];

  const links = await prisma.givingLink.findMany({ where: { id: { in: [...byLink.keys()] }, churchId } });
  return links.map((link) => ({ link, ...byLink.get(link.id)! }));
}

export async function loadDonorRefundsTab(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixTransferId: true },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);
  if (transferIds.length === 0) return [];
  return prisma.finixRefundOrReversal.findMany({
    where: { churchId, finixOriginalTransferId: { in: transferIds } },
    orderBy: { createdAtFinix: "desc" },
  });
}

export async function loadDonorBankReturnsTab(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixTransferId: true },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);
  if (transferIds.length === 0) return [];
  return prisma.bankReturn.findMany({
    where: { churchId, originalTransferId: { in: transferIds } },
    orderBy: { createdAtFinix: "desc" },
  });
}

export async function loadDonorDisputesTab(instrumentIds: string[], churchId: string) {
  if (instrumentIds.length === 0) return [];
  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } },
    select: { finixTransferId: true },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);
  if (transferIds.length === 0) return [];
  return prisma.finixDispute.findMany({
    where: { churchId, finixTransferId: { in: transferIds } },
    orderBy: { createdAtFinix: "desc" },
  });
}

export interface ActivityEvent {
  label: string;
  date: Date;
  sublabel?: string;
  amountCents?: number;
  href?: string;
}

/** Built entirely from real, already-recorded timestamps — no event is fabricated. */
export async function loadDonorActivityTab(donor: { id: string; createdAt: Date; updatedAt: Date }, instrumentIds: string[], churchId: string): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [{ label: "Donor Created", date: donor.createdAt }];
  if (donor.updatedAt.getTime() !== donor.createdAt.getTime()) {
    events.push({ label: "Donor Profile Updated", date: donor.updatedAt });
  }

  if (instrumentIds.length > 0) {
    const [transfers, subs, notes] = await Promise.all([
      prisma.finixTransfer.findMany({ where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } } }),
      prisma.finixSubscription.findMany({ where: { churchId, finixPaymentInstrumentId: { in: instrumentIds } } }),
      prisma.donorNote.findMany({ where: { donorId: donor.id, churchId, deletedAt: null } }),
    ]);

    const transferIds = transfers.map((t) => t.finixTransferId);
    const [refunds, bankReturns, disputes] = await Promise.all([
      transferIds.length ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } } }) : Promise.resolve([]),
      transferIds.length ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } } }) : Promise.resolve([]),
      transferIds.length ? prisma.finixDispute.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : Promise.resolve([]),
    ]);

    for (const t of transfers) {
      if (!t.createdAtFinix) continue;
      const state = (t.state || "").toUpperCase();
      if (state === "SUCCEEDED") events.push({ label: "Donation Succeeded", date: t.createdAtFinix, amountCents: t.amountCents ?? 0, href: `/merchant/transactions/payments?id=${t.finixTransferId}` });
      else if (state === "FAILED") events.push({ label: "Donation Failed", date: t.createdAtFinix, amountCents: t.amountCents ?? 0 });
      else if (state === "PENDING") events.push({ label: "Donation Created", date: t.createdAtFinix, amountCents: t.amountCents ?? 0 });
    }
    for (const r of refunds) {
      if (!r.createdAtFinix) continue;
      events.push({ label: (r.state || "").toUpperCase() === "SUCCEEDED" ? "Refund Succeeded" : "Refund Created", date: r.createdAtFinix, amountCents: r.amountCents ?? 0 });
    }
    for (const r of bankReturns) {
      if (!r.createdAtFinix) continue;
      events.push({ label: "ACH Return Received", date: r.createdAtFinix, amountCents: r.amountCents ?? 0, sublabel: r.reasonDescription || undefined });
    }
    for (const d of disputes) {
      if (d.createdAtFinix) events.push({ label: "Dispute Opened", date: d.createdAtFinix, amountCents: d.amountCents ?? 0, href: `/merchant/disputes/${d.finixDisputeId}` });
      if (d.respondedAt) events.push({ label: "Evidence Submitted", date: d.respondedAt });
      if (d.resolvedAt) events.push({ label: "Dispute Resolved", date: d.resolvedAt, sublabel: d.outcome || undefined });
    }
    for (const s of subs) {
      if (s.startedAt || s.createdAtFinix) events.push({ label: "Recurring Donation Created", date: s.startedAt ?? s.createdAtFinix!, amountCents: s.amountCents ?? 0 });
      if (s.canceledAt) events.push({ label: "Recurring Donation Canceled", date: s.canceledAt });
    }
    for (const n of notes) {
      events.push({ label: "Note Added", date: n.createdAt, sublabel: n.createdByEmail || undefined });
    }
  }

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
