import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordEmailOptOut } from "@/lib/giving/emailOptOut";
import { checkDonationRateLimit } from "@/lib/giving/donationRateLimit";

/**
 * Public unsubscribe for Giving Campaign email. The token is the recipient's
 * own unguessable campaign tracking token (the same one in their personal
 * giving link), so it identifies exactly one address at one church and needs
 * no login. POST handles both the confirm button on the unsubscribe page and
 * the mail-client "one-click" List-Unsubscribe request; GET redirects to the
 * confirmation page (a prefetching mail scanner must never unsubscribe
 * anyone by merely opening a link).
 */
async function optOut(token: string): Promise<{ ok: true; organizationName: string } | { ok: false }> {
  const recipient = await prisma.givingCampaignRecipient.findUnique({ where: { trackingToken: token } });
  if (!recipient?.recipientEmail) return { ok: false };
  await recordEmailOptOut(recipient.churchId, recipient.recipientEmail, recipient.campaignId);
  const church = await prisma.church.findUnique({ where: { id: recipient.churchId }, select: { name: true } });
  return { ok: true, organizationName: church?.name ?? "this organization" };
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!checkDonationRateLimit(`unsubscribe:${ip}`)) {
    return NextResponse.json({ success: false, error: "Too many attempts. Please try again in a moment." }, { status: 429 });
  }
  if (!/^[a-f0-9]{16,128}$/i.test(token)) return NextResponse.json({ success: false, error: "This unsubscribe link isn't valid." }, { status: 404 });
  const result = await optOut(token);
  if (!result.ok) return NextResponse.json({ success: false, error: "This unsubscribe link isn't valid." }, { status: 404 });
  return NextResponse.json({ success: true, organizationName: result.organizationName });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(token)}`, req.url));
}
