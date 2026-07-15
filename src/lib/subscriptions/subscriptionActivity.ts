import { prisma } from "@/lib/prisma";

export interface SubscriptionActivityEvent {
  label: string;
  date: Date;
  amountCents?: number;
  sublabel?: string;
  href?: string;
}

/** Built entirely from real, already-recorded timestamps on the subscription and its exactly-attributed transfers — no event is fabricated or estimated. */
export async function loadSubscriptionActivity(subscription: {
  id: string;
  finixSubscriptionId: string;
  createdAt: Date;
  createdAtFinix: Date | null;
  startedAt: Date | null;
  canceledAt: Date | null;
  completedAt: Date | null;
  amountCents: number | null;
}, churchId: string): Promise<SubscriptionActivityEvent[]> {
  const events: SubscriptionActivityEvent[] = [
    { label: "Subscription Created", date: subscription.createdAtFinix ?? subscription.createdAt, amountCents: subscription.amountCents ?? undefined },
  ];
  if (subscription.startedAt) events.push({ label: "Subscription Activated", date: subscription.startedAt });

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixSubscriptionId: subscription.finixSubscriptionId },
    orderBy: { createdAtFinix: "asc" },
  });
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [refunds, bankReturns, disputes] = await Promise.all([
    transferIds.length ? prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } } }) : Promise.resolve([]),
    transferIds.length ? prisma.finixDispute.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }) : Promise.resolve([]),
  ]);

  for (const t of transfers) {
    if (!t.createdAtFinix) continue;
    const state = (t.state || "").toUpperCase();
    if (state === "SUCCEEDED") events.push({ label: "Recurring Payment Succeeded", date: t.createdAtFinix, amountCents: t.amountCents ?? 0, href: `/merchant/transactions/payments?id=${t.finixTransferId}` });
    else if (state === "FAILED") events.push({ label: "Recurring Payment Failed", date: t.createdAtFinix, amountCents: t.amountCents ?? 0, sublabel: t.failureMessage || undefined });
    else if (state === "PENDING") events.push({ label: "Recurring Payment Scheduled", date: t.createdAtFinix, amountCents: t.amountCents ?? 0 });
  }
  for (const r of refunds) {
    if (!r.createdAtFinix) continue;
    events.push({ label: "Refund", date: r.createdAtFinix, amountCents: r.amountCents ?? 0 });
  }
  for (const r of bankReturns) {
    if (!r.createdAtFinix) continue;
    events.push({ label: "ACH Return", date: r.createdAtFinix, amountCents: r.amountCents ?? 0, sublabel: r.reasonDescription || undefined });
  }
  for (const d of disputes) {
    if (d.createdAtFinix) events.push({ label: "Dispute Opened", date: d.createdAtFinix, amountCents: d.amountCents ?? 0, href: `/merchant/disputes/${d.finixDisputeId}` });
    if (d.resolvedAt) events.push({ label: "Dispute Resolved", date: d.resolvedAt, sublabel: d.outcome || undefined });
  }

  if (subscription.canceledAt) events.push({ label: "Subscription Canceled", date: subscription.canceledAt });
  if (subscription.completedAt) events.push({ label: "Subscription Completed", date: subscription.completedAt });

  return events.sort((a, b) => b.date.getTime() - a.date.getTime());
}
