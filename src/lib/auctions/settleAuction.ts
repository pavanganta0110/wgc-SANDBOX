import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAndCalculateLineItems, totalsFromParsedItems } from "@/lib/invoices/invoiceLineItemInput";
import { generateNextInvoiceNumber } from "@/lib/invoices/invoiceNumber";
import { ensureInvoicePublicToken, InvoicePublicTokenAlreadyExistsError, regenerateInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { validateInvoiceForSend } from "@/lib/invoices/invoiceSendValidation";
import { splitWinnings } from "./bidRules";
import { sendNextBidderOfferEmail, sendWinnerEmail } from "./auctionEmails";

/**
 * Closing an auction and collecting from the winners. Everything here can run any number of times, at any time,
 * and by two runs at once, without closing an item twice, creating two wins for an item, or invoicing a win twice:
 *
 *   - An item is closed by one atomic update that only matches while the item is still open and still has the high
 *     bid we read. Whoever's update matches closes it and records the win (unique per item); the others do nothing.
 *   - A bidder's wins are claimed for invoicing by one atomic update that only matches unclaimed wins.
 *   - Winners pay through the existing invoice system (pay link, receipt with the fair-market-value split,
 *     automatic reminders). Nothing here charges a card: payment is the winner's own action, on the invoice page.
 *
 * Results are decided from the bids alone, so it does not matter when this runs after the closing time.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
const STALE_CLAIM_MS = 15 * 60_000;

export interface SettleOutcome {
  itemsClosed: number;
  itemsSold: number;
  invoicesCreated: number;
  settled: boolean;
}

/** Closes every item whose time is up, records the winners, invoices them, and marks the auction settled when nothing is left open. */
export async function settleAuction(auctionId: string, now: Date = new Date()): Promise<SettleOutcome> {
  const outcome: SettleOutcome = { itemsClosed: 0, itemsSold: 0, invoicesCreated: 0, settled: false };
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction || auction.status === "DRAFT" || auction.status === "SETTLED") return { ...outcome, settled: auction?.status === "SETTLED" };

  const due = await prisma.auctionItem.findMany({ where: { auctionId, status: "OPEN", endsAt: { lte: now } } });
  for (const item of due) {
    const sold = item.bidCount > 0 && item.highBidderId != null && item.currentBidCents != null;
    const closedHere = await prisma.$transaction(async (tx) => {
      const closed = await tx.auctionItem.updateMany({
        // Matches only while the item is still open, still due, and still has the high bid we read.
        where: { id: item.id, status: "OPEN", endsAt: { lte: now }, currentBidCents: item.currentBidCents, highBidderId: item.highBidderId },
        data: { status: sold ? "SOLD" : "UNSOLD", closedAt: now, winnerBidderId: sold ? item.highBidderId : null, winningBidCents: sold ? item.currentBidCents : null },
      });
      if (closed.count === 0) return false;
      if (sold) {
        try {
          await tx.auctionWin.create({ data: { churchId: auction.churchId, auctionId, itemId: item.id, bidderId: item.highBidderId!, amountCents: item.currentBidCents! } });
        } catch (err) {
          if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err; // already recorded
        }
      }
      return true;
    });
    if (closedHere) {
      outcome.itemsClosed += 1;
      if (sold) outcome.itemsSold += 1;
    }
  }

  outcome.invoicesCreated = await invoiceUnclaimedWins(auctionId, now);

  const stillOpen = await prisma.auctionItem.count({ where: { auctionId, status: "OPEN" } });
  if (stillOpen === 0) {
    await prisma.auction.updateMany({ where: { id: auctionId, status: { not: "SETTLED" } }, data: { status: "SETTLED", settledAt: now } });
    outcome.settled = true;
  }
  return outcome;
}

/** Ends an auction early on the organization's say-so: every open item closes now, then it settles normally. */
export async function closeAuctionNow(auctionId: string, churchId: string, now: Date = new Date()): Promise<SettleOutcome> {
  await prisma.auctionItem.updateMany({ where: { auctionId, churchId, status: "OPEN", endsAt: { gt: now } }, data: { endsAt: now } });
  await prisma.auction.updateMany({ where: { id: auctionId, churchId, endsAt: { gt: now } }, data: { endsAt: now } });
  return settleAuction(auctionId, now);
}

async function mintInvoiceToken(invoiceId: string, churchId: string): Promise<string> {
  try {
    return await ensureInvoicePublicToken(invoiceId, churchId);
  } catch (err) {
    if (err instanceof InvoicePublicTokenAlreadyExistsError) return regenerateInvoicePublicToken(invoiceId, churchId);
    throw err;
  }
}

/** One invoice per bidder per batch of wins, claimed atomically so two runs create one. Returns how many invoices were created. */
async function invoiceUnclaimedWins(auctionId: string, now: Date): Promise<number> {
  const auction = await prisma.auction.findUnique({ where: { id: auctionId } });
  if (!auction) return 0;
  const waiting = await prisma.auctionWin.findMany({ where: { auctionId, status: "PENDING_PAYMENT", invoiceId: null, invoiceClaimedAt: null } });
  const byBidder = new Map<string, string[]>();
  for (const win of waiting) byBidder.set(win.bidderId, [...(byBidder.get(win.bidderId) ?? []), win.id]);

  let created = 0;
  for (const [bidderId, winIds] of byBidder) {
    const claimAt = new Date();
    const claimed = await prisma.auctionWin.updateMany({ where: { id: { in: winIds }, invoiceClaimedAt: null, invoiceId: null, status: "PENDING_PAYMENT" }, data: { invoiceClaimedAt: claimAt } });
    if (claimed.count === 0) continue; // another run took them
    const wins = await prisma.auctionWin.findMany({ where: { auctionId, bidderId, invoiceClaimedAt: claimAt, invoiceId: null } });
    if (wins.length === 0) continue;
    try {
      await createAndSendInvoice({ auction, bidderId, wins, now });
      created += 1;
    } catch (err) {
      // Release the claim so the next run tries again; a half-made invoice is picked up by the unsent-invoice retry.
      console.error("Auction invoice failed, will retry:", err);
      await prisma.auctionWin.updateMany({ where: { id: { in: wins.map((w) => w.id) }, invoiceId: null }, data: { invoiceClaimedAt: null } });
    }
  }
  return created;
}

type AuctionRow = NonNullable<Awaited<ReturnType<typeof prisma.auction.findUnique>>>;
type WinRow = Awaited<ReturnType<typeof prisma.auctionWin.findMany>>[number];

async function findOrCreateClient(churchId: string, bidder: { name: string; email: string; normalizedEmail: string; phone: string | null }): Promise<string> {
  const existing = await prisma.client.findFirst({ where: { churchId, normalizedEmail: bidder.normalizedEmail }, select: { id: true } });
  if (existing) return existing.id;
  const [firstName, ...rest] = bidder.name.split(" ");
  const created = await prisma.client.create({
    data: {
      churchId,
      clientType: "INDIVIDUAL",
      firstName,
      lastName: rest.join(" ") || null,
      displayName: bidder.name,
      email: bidder.email,
      normalizedEmail: bidder.normalizedEmail,
      phone: bidder.phone,
    },
  });
  return created.id;
}

async function createAndSendInvoice(params: { auction: AuctionRow; bidderId: string; wins: WinRow[]; now: Date }): Promise<void> {
  const { auction, bidderId, wins, now } = params;
  const bidder = await prisma.auctionBidder.findUnique({ where: { id: bidderId } });
  if (!bidder) throw new Error("Bidder missing.");
  const items = await prisma.auctionItem.findMany({ where: { id: { in: wins.map((w) => w.itemId) } } });
  const itemById = new Map(items.map((i) => [i.id, i]));

  const lines = wins.map((w, index) => {
    const item = itemById.get(w.itemId);
    return { description: `Item ${item?.itemNumber ?? ""}: ${item?.title ?? "Auction item"}`, quantity: 1, unitPriceCents: w.amountCents, sortOrder: index };
  });
  const parsed = parseAndCalculateLineItems(lines);
  if (!parsed.valid) throw new Error(parsed.error ?? "Invoice lines invalid.");
  const totals = totalsFromParsedItems(parsed.items, 0, 0);

  // The receipt's tax split: only the amount above what the goods are worth is a charitable gift.
  const split = splitWinnings(wins.map((w) => ({ amountCents: w.amountCents, fairMarketValueCents: itemById.get(w.itemId)?.fairMarketValueCents ?? 0 })));
  const classification = split.goodsServicesValueCents === 0 ? "CHARITABLE_DONATION" : split.charitablePortionCents === 0 ? "GOODS_OR_SERVICES" : "PARTIAL_DONATION";

  const clientId = await findOrCreateClient(auction.churchId, bidder);
  const dueDate = new Date(now.getTime() + auction.paymentWindowHours * 3_600_000);
  const invoiceNumber = await generateNextInvoiceNumber(auction.churchId);

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        churchId: auction.churchId,
        invoiceNumber,
        clientId,
        status: "DRAFT",
        classification,
        goodsServicesValueCents: classification === "PARTIAL_DONATION" ? split.goodsServicesValueCents : null,
        charitablePortionCents: classification === "PARTIAL_DONATION" ? split.charitablePortionCents : null,
        noGoodsOrServicesConfirmed: classification === "CHARITABLE_DONATION",
        title: `${auction.title}: your winning items`,
        clientMemo: `Thank you for bidding in ${auction.title}.`,
        issueDate: now,
        dueDate,
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        serviceFeeCents: totals.serviceFeeCents,
        totalCents: totals.totalCents,
        balanceCents: totals.totalCents,
        allowFeeCoverage: true,
        feeCoveredBy: "MERCHANT",
        autoCloseWhenPaid: true,
      },
    });
    await tx.invoiceLineItem.createMany({
      data: parsed.items.map((item) => ({
        invoiceId: inv.id,
        churchId: auction.churchId,
        description: item.input.description,
        quantity: item.input.quantity,
        unitPriceCents: item.input.unitPriceCents,
        discountType: item.input.discountType ?? "FIXED",
        discountValue: item.input.discountValue ?? 0,
        taxRateBasisPoints: item.input.taxRateBasisPoints ?? null,
        taxAmountCents: item.calculated.taxAmountCents,
        totalCents: item.calculated.totalCents,
        sortOrder: item.input.sortOrder ?? 0,
        productCode: null,
      })),
    });
    await tx.auctionWin.updateMany({ where: { id: { in: wins.map((w) => w.id) } }, data: { invoiceId: inv.id, dueAt: dueDate } });
    return inv;
  });

  await sendWinnerInvoice({ auction, bidder, invoiceId: invoice.id, wins, itemById, totalCents: totals.totalCents, dueDate });
}

/** Mints the pay link, emails the winner, and only then marks the invoice sent. A failure leaves it DRAFT for the retry. */
async function sendWinnerInvoice(params: {
  auction: AuctionRow;
  bidder: { name: string; email: string };
  invoiceId: string;
  wins: WinRow[];
  itemById: Map<string, { itemNumber: number; title: string }>;
  totalCents: number;
  dueDate: Date;
}): Promise<boolean> {
  const { auction, bidder, invoiceId, wins, itemById, totalCents, dueDate } = params;
  const validation = await validateInvoiceForSend(invoiceId, auction.churchId);
  if (!validation.valid) {
    console.error("Auction invoice not ready to send:", invoiceId, validation.errors);
    return false;
  }
  const token = await mintInvoiceToken(invoiceId, auction.churchId);
  const payUrl = `${APP_URL}/invoice/${token}`;
  const listed = wins.map((w) => ({ title: `Item ${itemById.get(w.itemId)?.itemNumber ?? ""}: ${itemById.get(w.itemId)?.title ?? "Auction item"}`, amountCents: w.amountCents }));

  const offered = wins.length === 1 && wins[0].offeredFromBidderId != null;
  const sent = offered
    ? await sendNextBidderOfferEmail({ churchId: auction.churchId, auctionId: auction.id, auctionTitle: auction.title, to: bidder.email, recipientName: bidder.name, itemTitle: listed[0].title, amountCents: listed[0].amountCents, payUrl, dueAt: dueDate })
    : await sendWinnerEmail({ churchId: auction.churchId, auctionId: auction.id, auctionTitle: auction.title, to: bidder.email, recipientName: bidder.name, items: listed, totalCents, payUrl, dueAt: dueDate });
  if (!sent) return false;

  const sentAt = new Date();
  await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "SENT", sentAt } });
  const { scheduleInvoiceReminders } = await import("@/lib/invoices/invoiceReminders");
  await scheduleInvoiceReminders(invoiceId, auction.churchId).catch((err) => console.error("Scheduling invoice reminders failed (non-fatal):", err));
  await prisma.invoiceActivity.create({ data: { invoiceId, churchId: auction.churchId, activityType: "invoice.sent", actorEmail: "auction@wgcpayments.com" } }).catch(() => undefined);
  return true;
}

/** Invoices created but never delivered (the email failed): try again. Returns how many went out. */
export async function retryUnsentAuctionInvoices(now: Date = new Date()): Promise<number> {
  const stuck = await prisma.auctionWin.findMany({ where: { status: "PENDING_PAYMENT", invoiceId: { not: null } }, take: 200 });
  const invoiceIds = [...new Set(stuck.map((w) => w.invoiceId!))];
  const drafts = await prisma.invoice.findMany({ where: { id: { in: invoiceIds }, status: "DRAFT" } });
  let sent = 0;
  for (const invoice of drafts) {
    const wins = stuck.filter((w) => w.invoiceId === invoice.id);
    const auction = await prisma.auction.findUnique({ where: { id: wins[0].auctionId } });
    const bidder = await prisma.auctionBidder.findUnique({ where: { id: wins[0].bidderId } });
    if (!auction || !bidder) continue;
    const items = await prisma.auctionItem.findMany({ where: { id: { in: wins.map((w) => w.itemId) } } });
    const ok = await sendWinnerInvoice({ auction, bidder, invoiceId: invoice.id, wins, itemById: new Map(items.map((i) => [i.id, i])), totalCents: invoice.totalCents, dueDate: invoice.dueDate });
    if (ok) sent += 1;
  }
  void now;
  return sent;
}

/** Wins whose invoice has been paid become PAID. Reads the invoice's own status: no hook into the payment code. */
export async function syncPaidWins(auctionId?: string): Promise<number> {
  const open = await prisma.auctionWin.findMany({ where: { status: "PENDING_PAYMENT", invoiceId: { not: null }, ...(auctionId ? { auctionId } : {}) }, take: 500 });
  if (open.length === 0) return 0;
  const invoices = await prisma.invoice.findMany({ where: { id: { in: [...new Set(open.map((w) => w.invoiceId!))] }, status: "PAID" }, select: { id: true, paidAt: true } });
  let changed = 0;
  for (const invoice of invoices) {
    const result = await prisma.auctionWin.updateMany({ where: { invoiceId: invoice.id, status: "PENDING_PAYMENT" }, data: { status: "PAID", paidAt: invoice.paidAt ?? new Date() } });
    changed += result.count;
  }
  return changed;
}

/**
 * Wins still unpaid after their deadline. When the auction allows it, the item moves to the next-highest bidder who
 * has not already been offered it (a new invoice, a fresh deadline); otherwise the win is marked forfeited and the
 * organization decides what to do. The lapsed invoice is voided once none of its wins is still waiting on it.
 */
export async function offerOverdueWins(now: Date = new Date()): Promise<{ offered: number; forfeited: number }> {
  const overdue = await prisma.auctionWin.findMany({ where: { status: "PENDING_PAYMENT", invoiceId: { not: null }, dueAt: { lte: now } }, take: 200 });
  const result = { offered: 0, forfeited: 0 };
  const touchedInvoices = new Set<string>();

  for (const win of overdue) {
    const auction = await prisma.auction.findUnique({ where: { id: win.auctionId } });
    if (!auction) continue;
    const invoice = win.invoiceId ? await prisma.invoice.findUnique({ where: { id: win.invoiceId }, select: { status: true } }) : null;
    if (invoice?.status === "PAID") continue; // paid; syncPaidWins records it

    const next = auction.offerNextBidder ? await nextBidderFor(win) : null;
    if (win.invoiceId) touchedInvoices.add(win.invoiceId);
    if (next) {
      const moved = await prisma.auctionWin.updateMany({
        where: { id: win.id, status: "PENDING_PAYMENT", bidderId: win.bidderId },
        data: { bidderId: next.bidderId, amountCents: next.amountCents, offeredFromBidderId: win.bidderId, invoiceId: null, invoiceClaimedAt: null, dueAt: null },
      });
      if (moved.count === 1) {
        await prisma.auctionItem.update({ where: { id: win.itemId }, data: { winnerBidderId: next.bidderId, winningBidCents: next.amountCents } });
        result.offered += 1;
      }
    } else {
      const forfeited = await prisma.auctionWin.updateMany({ where: { id: win.id, status: "PENDING_PAYMENT" }, data: { status: "FORFEITED" } });
      result.forfeited += forfeited.count;
    }
  }

  for (const invoiceId of touchedInvoices) {
    const stillWaiting = await prisma.auctionWin.count({ where: { invoiceId, status: "PENDING_PAYMENT" } });
    if (stillWaiting === 0) await prisma.invoice.updateMany({ where: { id: invoiceId, status: { notIn: ["PAID", "VOID"] } }, data: { status: "VOID", voidedAt: now } });
  }
  return result;
}

/** The highest bid below the current holder's, from someone who has not already had their chance. */
async function nextBidderFor(win: WinRow): Promise<{ bidderId: string; amountCents: number } | null> {
  const bids = await prisma.auctionBid.findMany({ where: { itemId: win.itemId }, orderBy: { amountCents: "desc" } });
  // Everyone who bid at or above the current win has already been offered the item (or still holds it).
  const alreadyHadChance = new Set(bids.filter((b) => b.amountCents >= win.amountCents).map((b) => b.bidderId));
  alreadyHadChance.add(win.bidderId);
  for (const bid of bids) {
    if (bid.amountCents >= win.amountCents || alreadyHadChance.has(bid.bidderId)) continue;
    const bidder = await prisma.auctionBidder.findUnique({ where: { id: bid.bidderId }, select: { status: true } });
    if (bidder?.status === "APPROVED") return { bidderId: bid.bidderId, amountCents: bid.amountCents };
  }
  return null;
}

/** A claim that never produced an invoice (the process died) is released so the win is picked up again. */
export async function releaseStaleClaims(now: Date = new Date()): Promise<number> {
  const result = await prisma.auctionWin.updateMany({ where: { invoiceId: null, invoiceClaimedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) } }, data: { invoiceClaimedAt: null } });
  return result.count;
}

/** What the daily cron runs: settle what is due, deliver anything undelivered, record payments, and move on unpaid wins. */
export async function runAuctionSweep(now: Date = new Date()) {
  const due = await prisma.auction.findMany({ where: { status: "OPEN", endsAt: { lte: now } }, select: { id: true }, take: 100 });
  const open = await prisma.auction.findMany({ where: { status: "OPEN", endsAt: { gt: now } }, select: { id: true }, take: 100 });
  let settled = 0;
  // An item extended past the auction's end time is still due on its own clock, so check every open auction.
  for (const auction of [...due, ...open]) {
    const outcome = await settleAuction(auction.id, now);
    if (outcome.itemsClosed > 0 || outcome.settled) settled += 1;
  }
  const released = await releaseStaleClaims(now);
  const paid = await syncPaidWins();
  const moved = await offerOverdueWins(now);
  // Offered wins need their new invoices right away.
  const offeredAuctions = await prisma.auctionWin.findMany({ where: { status: "PENDING_PAYMENT", invoiceId: null, invoiceClaimedAt: null }, select: { auctionId: true }, distinct: ["auctionId"] });
  let invoices = 0;
  for (const { auctionId } of offeredAuctions) invoices += await invoiceUnclaimedWins(auctionId, now);
  const resent = await retryUnsentAuctionInvoices(now);
  return { auctionsSettled: settled, claimsReleased: released, winsPaid: paid, offered: moved.offered, forfeited: moved.forfeited, invoicesCreated: invoices, invoicesResent: resent };
}
