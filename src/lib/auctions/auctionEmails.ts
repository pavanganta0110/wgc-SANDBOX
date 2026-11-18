import { sendWgcEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { resolveInvoiceBranding } from "@/lib/invoices/invoiceBranding";
import { formatCents } from "./bidRules";
import type { AuctionOverview } from "./auctionOverview";
import { escapeHtml, introHtmlFor, parseEmailSettings, subjectFor, type EmailKind, type EmailSettings } from "./emailSettings";

/**
 * Every auction email, sent from WGC but branded as the organization (its logo and name, replies to its support
 * address), like the giving-campaign emails. None of these move money. Each returns normally on failure: a bidder
 * not getting an "outbid" email must never undo or block a bid.
 *
 * The organization can change the subject and add its own message to the emails listed in emailSettings.ts. What it
 * writes is escaped, and the essential part of each email (amounts, pay button, code) is not editable.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

export function publicAuctionUrl(slug: string): string {
  return `${APP_URL}/auction/${slug}`;
}

export function liveWallUrl(slug: string): string {
  return `${APP_URL}/auction/${slug}/wall`;
}

interface Sender {
  churchId: string;
  auctionTitle: string;
  to: string;
  recipientName?: string | null;
}

type Values = Record<string, string | number | null | undefined>;

export async function loadEmailSettings(auctionId: string): Promise<EmailSettings> {
  try {
    const row = await prisma.auction.findUnique({ where: { id: auctionId }, select: { emailSettingsJson: true } });
    return parseEmailSettings(row?.emailSettingsJson);
  } catch {
    return {}; // never let a settings read stop an email
  }
}

async function deliver(
  s: Sender,
  options: { subject: string; title: string; badgeText: string; badgeColor?: string; bodyHtml: string; relatedId: string; replyToOverride?: string }
): Promise<boolean> {
  try {
    const branding = await resolveInvoiceBranding(s.churchId);
    const result = await sendWgcEmail({
      to: s.to,
      subject: options.subject,
      title: options.title,
      badgeText: options.badgeText,
      badgeColor: options.badgeColor ?? "#C99A2E",
      bodyHtml: options.bodyHtml,
      logoUrl: branding.logoUrl ?? undefined,
      logoAlt: branding.organizationDisplayName,
      senderName: branding.organizationDisplayName,
      replyTo: options.replyToOverride ?? branding.organizationSupportEmail ?? undefined,
      log: { churchId: s.churchId, recipientName: s.recipientName ?? null, category: "OTHER", relatedEntityType: "auction", relatedEntityId: options.relatedId },
    });
    return Boolean(result?.success);
  } catch (err) {
    console.error("Auction email failed (non-fatal):", err);
    return false;
  }
}

/** An email the organization can reword: its subject and its own message are applied, the standard body is kept. */
async function sendCustomizable(
  s: Sender,
  options: { kind: EmailKind; values: Values; title: string; badgeText: string; badgeColor?: string; relatedId: string; body: (intro: string) => string; settings?: EmailSettings }
): Promise<boolean> {
  const settings = options.settings ?? (await loadEmailSettings(options.relatedId));
  return deliver(s, {
    subject: subjectFor(options.kind, settings, options.values),
    title: options.title,
    badgeText: options.badgeText,
    badgeColor: options.badgeColor,
    bodyHtml: options.body(introHtmlFor(options.kind, settings, options.values)),
    relatedId: options.relatedId,
  });
}

const button = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;padding:12px 24px;background:#0B5DBC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a></p>`;

const greet = (name?: string | null) => `<p>Hi ${escapeHtml(name || "there")},</p>`;

export function sendBidderCodeEmail(s: Sender & { code: string; auctionId: string }) {
  // Not customizable: it carries a security code.
  return deliver(s, {
    subject: `Your code for ${s.auctionTitle}: ${s.code}`,
    title: "Confirm your email to bid",
    badgeText: "Auction",
    bodyHtml: `${greet(s.recipientName)}<p>Your code to bid in <strong>${escapeHtml(s.auctionTitle)}</strong> is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${s.code}</p><p>It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    relatedId: s.auctionId,
  });
}

export function sendBidderApprovedEmail(s: Sender & { auctionId: string; slug: string; bidderNumber: number; settings?: EmailSettings }) {
  return sendCustomizable(s, {
    kind: "approved", relatedId: s.auctionId, settings: s.settings, title: "You're approved to bid", badgeText: "Approved", badgeColor: "#10B981",
    values: { name: s.recipientName, auction: s.auctionTitle, bidderNumber: s.bidderNumber },
    body: (intro) => `${greet(s.recipientName)}${intro}<p>You're approved to bid in <strong>${escapeHtml(s.auctionTitle)}</strong>. Your bidder number is <strong>${s.bidderNumber}</strong>.</p>${button(publicAuctionUrl(s.slug), "Go to the auction")}`,
  });
}

export function sendBidderDeclinedEmail(s: Sender & { auctionId: string; settings?: EmailSettings }) {
  return sendCustomizable(s, {
    kind: "declined", relatedId: s.auctionId, settings: s.settings, title: "We couldn't approve your registration", badgeText: "Auction", badgeColor: "#6B7280",
    values: { name: s.recipientName, auction: s.auctionTitle },
    body: (intro) => `${greet(s.recipientName)}${intro}<p>We weren't able to approve your registration for <strong>${escapeHtml(s.auctionTitle)}</strong>. If you think this is a mistake, please reply to this email.</p>`,
  });
}

export function sendOutbidEmail(s: Sender & { auctionId: string; slug: string; itemTitle: string; newBidCents: number; settings?: EmailSettings }) {
  return sendCustomizable(s, {
    kind: "outbid", relatedId: s.auctionId, settings: s.settings, title: "You've been outbid", badgeText: "Outbid", badgeColor: "#F59E0B",
    values: { name: s.recipientName, auction: s.auctionTitle, item: s.itemTitle, amount: formatCents(s.newBidCents) },
    body: (intro) => `${greet(s.recipientName)}${intro}<p>Someone bid ${formatCents(s.newBidCents)} on <strong>${escapeHtml(s.itemTitle)}</strong> in ${escapeHtml(s.auctionTitle)}.</p>${button(publicAuctionUrl(s.slug), "Bid again")}`,
  });
}

export function sendWinnerEmail(s: Sender & { auctionId: string; items: { title: string; amountCents: number }[]; totalCents: number; payUrl: string; dueAt: Date; settings?: EmailSettings }) {
  const list = s.items.map((i) => `<li>${escapeHtml(i.title)} — ${formatCents(i.amountCents)}</li>`).join("");
  return sendCustomizable(s, {
    kind: "winner", relatedId: s.auctionId, settings: s.settings, title: "You won!", badgeText: "Winner", badgeColor: "#10B981",
    values: { name: s.recipientName, auction: s.auctionTitle },
    body: (intro) => `${greet(s.recipientName)}${intro}<p>Congratulations, you won in <strong>${escapeHtml(s.auctionTitle)}</strong>:</p><ul>${list}</ul><p>Total: <strong>${formatCents(s.totalCents)}</strong>. Please pay by ${s.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>${button(s.payUrl, "Pay now")}`,
  });
}

export function sendNextBidderOfferEmail(s: Sender & { auctionId: string; itemTitle: string; amountCents: number; payUrl: string; dueAt: Date; settings?: EmailSettings }) {
  return sendCustomizable(s, {
    kind: "nextBidderOffer", relatedId: s.auctionId, settings: s.settings, title: "Good news: this item is available to you", badgeText: "Offer", badgeColor: "#10B981",
    values: { name: s.recipientName, auction: s.auctionTitle, item: s.itemTitle, amount: formatCents(s.amountCents) },
    body: (intro) => `${greet(s.recipientName)}${intro}<p>The top bidder on <strong>${escapeHtml(s.itemTitle)}</strong> didn't complete payment, and your bid of ${formatCents(s.amountCents)} was next in line. It's yours if you'd like it. Please pay by ${s.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>${button(s.payUrl, "Pay now")}`,
  });
}

/** A message the organization writes to its bidders (for example "bidding opens tonight" or "one hour left"). */
export function sendAnnouncementEmail(s: Sender & { auctionId: string; slug: string; subject: string; message: string; replyTo?: string }) {
  const text = escapeHtml(s.message).replace(/\r?\n/g, "<br>");
  return deliver(s, {
    subject: s.subject,
    title: s.auctionTitle,
    badgeText: "Auction",
    relatedId: s.auctionId,
    replyToOverride: s.replyTo,
    bodyHtml: `${greet(s.recipientName)}<p>${text}</p>${button(publicAuctionUrl(s.slug), "Go to the auction")}<p style="color:#6B7280;font-size:12px;">You're getting this because you registered to bid in ${escapeHtml(s.auctionTitle)}.</p>`,
  });
}

/** A copy of one of the automatic emails with sample details, so the organization can see exactly how it reads. */
export function sendTestEmail(s: Sender & { auctionId: string; slug: string; kind: EmailKind; settings: EmailSettings }) {
  const common = { churchId: s.churchId, auctionId: s.auctionId, auctionTitle: s.auctionTitle, to: s.to, recipientName: s.recipientName, settings: s.settings };
  switch (s.kind) {
    case "approved": return sendBidderApprovedEmail({ ...common, slug: s.slug, bidderNumber: 123 });
    case "declined": return sendBidderDeclinedEmail(common);
    case "outbid": return sendOutbidEmail({ ...common, slug: s.slug, itemTitle: "Sample Item", newBidCents: 15000 });
    case "winner": return sendWinnerEmail({ ...common, items: [{ title: "Item 1: Sample Item", amountCents: 15000 }], totalCents: 15000, payUrl: publicAuctionUrl(s.slug), dueAt: new Date(Date.now() + 72 * 3_600_000) });
    case "nextBidderOffer": return sendNextBidderOfferEmail({ ...common, itemTitle: "Sample Item", amountCents: 12000, payUrl: publicAuctionUrl(s.slug), dueAt: new Date(Date.now() + 72 * 3_600_000) });
  }
}

/** The after-auction summary for the organization itself: who took part, what sold, and what has been paid. */
export function sendOverviewEmail(s: Sender & { auctionId: string; overview: AuctionOverview; manageUrl: string }) {
  const o = s.overview;
  const row = (label: string, value: string) => `<tr><td style="padding:6px 12px 6px 0;color:#6B7280;">${escapeHtml(label)}</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(value)}</td></tr>`;
  const top = o.topItems.map((i) => `<li>Item ${i.itemNumber}: ${escapeHtml(i.title)} — ${formatCents(i.amountCents)} (${i.bidCount} bids)</li>`).join("");
  return deliver(s, {
    subject: `${s.auctionTitle}: results — ${formatCents(o.raisedCents)} raised`,
    title: "Your auction results",
    badgeText: "Results",
    badgeColor: "#10B981",
    relatedId: s.auctionId,
    bodyHtml: `<p>${escapeHtml(s.auctionTitle)} has ended. Here is how it went.</p>
<table style="border-collapse:collapse;">
${row("People who registered", String(o.registered))}${row("Approved to bid", String(o.approved))}${row("People who placed a bid", String(o.participated))}${row("People who won something", String(o.winners))}${row("Bids placed", `${o.totalBids} (${o.onlineBids} online, ${o.roomBids} in the room)`)}
${row("Items sold", `${o.itemsSold} of ${o.itemsTotal}`)}${row("Raised", formatCents(o.raisedCents) + (o.goalPercent != null ? ` (${o.goalPercent}% of your goal)` : ""))}${row("Paid so far", formatCents(o.paidCents))}${row("Waiting on payment", formatCents(o.outstandingCents))}${row("Average sale", o.averageSaleCents == null ? "—" : formatCents(o.averageSaleCents))}${row("Above the items' value", formatCents(o.aboveValueCents))}
</table>
${top ? `<p style="margin-top:16px;"><strong>Top items</strong></p><ul>${top}</ul>` : ""}
<p>Winners were emailed their invoices and are reminded until they pay. Unpaid items move to the next bidder automatically.</p>${button(s.manageUrl, "See the full results")}`,
  });
}
