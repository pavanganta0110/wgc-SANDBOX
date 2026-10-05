import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/donors/donorContact";
import { createFundraiserLoginToken } from "@/lib/fundraiserPortal/fundraiserAuth";
import { sendWgcEmail } from "@/lib/email";

const GENERIC_RESPONSE = { message: "If that email matches an active fundraiser, we've sent a login link." };

/** Always returns the same generic message regardless of match, to avoid confirming or denying whether an email belongs to a fundraiser (same rationale as any password-reset endpoint). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const normalized = normalizeEmail(email);
  if (!normalized) return NextResponse.json(GENERIC_RESPONSE);

  const fundraiser = await prisma.campaignFundraiser.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
  });
  if (!fundraiser) return NextResponse.json(GENERIC_RESPONSE);

  const campaign = await prisma.fundraisingCampaign.findUnique({ where: { id: fundraiser.fundraisingCampaignId } });
  if (!campaign || campaign.status !== "ACTIVE" || campaign.archivedAt) return NextResponse.json(GENERIC_RESPONSE);

  const church = await prisma.church.findUnique({ where: { id: fundraiser.churchId } });
  if (!church) return NextResponse.json(GENERIC_RESPONSE);

  const token = await createFundraiserLoginToken(fundraiser.id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const loginUrl = `${appUrl}/fundraiser/login/${token}`;

  await sendWgcEmail({
    to: fundraiser.email!,
    subject: `Your fundraiser login link for ${campaign.name}`,
    title: "Log In to Your Fundraiser Page",
    badgeText: "Login Link",
    badgeColor: "#4F46E5",
    bodyHtml: `
      <p>Here's your secure link to manage your fundraiser page for <strong>${campaign.name}</strong> at ${church.name}.</p>
      <p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#0f172a;color:#fff;border-radius:8px;text-decoration:none;">Log In</a></p>
      <p style="font-size:12px;color:#64748b;">This link expires in 15 minutes and can only be used once.</p>
    `,
  });

  return NextResponse.json(GENERIC_RESPONSE);
}
