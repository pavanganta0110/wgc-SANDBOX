import { sendWgcEmail } from "@/lib/email";
import { resolveInvoiceBranding } from "@/lib/invoices/invoiceBranding";
import { formatCents } from "./bidRules";

/**
 * Every auction email, sent from WGC but branded as the organization (its logo and name, replies to its support
 * address), like the giving-campaign emails. None of these move money. Each returns normally on failure: a bidder
 * not getting an "outbid" email must never undo or block a bid.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";

export function publicAuctionUrl(slug: string): string {
  return `${APP_URL}/auction/${slug}`;
}

export function liveWallUrl(slug: string): string {
  return `${APP_URL}/auction/${slug}/wall`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface Sender {
  churchId: string;
  auctionTitle: string;
  to: string;
  recipientName?: string | null;
}

async function send(
  s: Sender,
  options: { subject: string; title: string; badgeText: string; badgeColor?: string; bodyHtml: string; relatedId: string }
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
      replyTo: branding.organizationSupportEmail ?? undefined,
      log: {
        churchId: s.churchId,
        recipientName: s.recipientName ?? null,
        category: "OTHER",
        relatedEntityType: "auction",
        relatedEntityId: options.relatedId,
      },
    });
    return Boolean(result?.success);
  } catch (err) {
    console.error("Auction email failed (non-fatal):", err);
    return false;
  }
}

const button = (href: string, label: string) =>
  `<p><a href="${href}" style="display:inline-block;padding:12px 24px;background:#0B5DBC;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">${escapeHtml(label)}</a></p>`;

export function sendBidderCodeEmail(s: Sender & { code: string; auctionId: string }) {
  return send(s, {
    subject: `Your code for ${s.auctionTitle}: ${s.code}`,
    title: "Confirm your email to bid",
    badgeText: "Auction",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>Your code to bid in <strong>${escapeHtml(s.auctionTitle)}</strong> is:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px;">${s.code}</p><p>It works for 15 minutes. If you didn't ask for it, you can ignore this email.</p>`,
    relatedId: s.auctionId,
  });
}

export function sendBidderApprovedEmail(s: Sender & { auctionId: string; slug: string; bidderNumber: number }) {
  return send(s, {
    subject: `You're approved to bid in ${s.auctionTitle}`,
    title: "You're approved to bid",
    badgeText: "Approved",
    badgeColor: "#10B981",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>You're approved to bid in <strong>${escapeHtml(s.auctionTitle)}</strong>. Your bidder number is <strong>${s.bidderNumber}</strong>.</p>${button(publicAuctionUrl(s.slug), "Go to the auction")}`,
    relatedId: s.auctionId,
  });
}

export function sendBidderDeclinedEmail(s: Sender & { auctionId: string }) {
  return send(s, {
    subject: `About your registration for ${s.auctionTitle}`,
    title: "We couldn't approve your registration",
    badgeText: "Auction",
    badgeColor: "#6B7280",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>We weren't able to approve your registration for <strong>${escapeHtml(s.auctionTitle)}</strong>. If you think this is a mistake, please reply to this email.</p>`,
    relatedId: s.auctionId,
  });
}

export function sendOutbidEmail(s: Sender & { auctionId: string; slug: string; itemTitle: string; newBidCents: number }) {
  return send(s, {
    subject: `You've been outbid on ${s.itemTitle}`,
    title: "You've been outbid",
    badgeText: "Outbid",
    badgeColor: "#F59E0B",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>Someone bid ${formatCents(s.newBidCents)} on <strong>${escapeHtml(s.itemTitle)}</strong> in ${escapeHtml(s.auctionTitle)}.</p>${button(publicAuctionUrl(s.slug), "Bid again")}`,
    relatedId: s.auctionId,
  });
}

export function sendWinnerEmail(s: Sender & { auctionId: string; items: { title: string; amountCents: number }[]; totalCents: number; payUrl: string; dueAt: Date }) {
  const list = s.items.map((i) => `<li>${escapeHtml(i.title)} — ${formatCents(i.amountCents)}</li>`).join("");
  return send(s, {
    subject: `You won! Pay for your items from ${s.auctionTitle}`,
    title: "You won!",
    badgeText: "Winner",
    badgeColor: "#10B981",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>Congratulations, you won in <strong>${escapeHtml(s.auctionTitle)}</strong>:</p><ul>${list}</ul><p>Total: <strong>${formatCents(s.totalCents)}</strong>. Please pay by ${s.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>${button(s.payUrl, "Pay now")}`,
    relatedId: s.auctionId,
  });
}

export function sendNextBidderOfferEmail(s: Sender & { auctionId: string; itemTitle: string; amountCents: number; payUrl: string; dueAt: Date }) {
  return send(s, {
    subject: `An item from ${s.auctionTitle} is yours if you want it`,
    title: "Good news: this item is available to you",
    badgeText: "Offer",
    badgeColor: "#10B981",
    bodyHtml: `<p>Hi ${escapeHtml(s.recipientName || "there")},</p><p>The top bidder on <strong>${escapeHtml(s.itemTitle)}</strong> didn't complete payment, and your bid of ${formatCents(s.amountCents)} was next in line. It's yours if you'd like it. Please pay by ${s.dueAt.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.</p>${button(s.payUrl, "Pay now")}`,
    relatedId: s.auctionId,
  });
}
