import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashSetupLinkToken } from "@/lib/subscriptions/setupLinkToken";
import { checkSetupLinkRateLimit } from "@/lib/subscriptions/setupLinkRateLimit";
import { frequencyLabel } from "@/lib/subscriptions/subscriptionStatus";

/** Public, unauthenticated — resolves a setup token to the proposed terms only. Never exposes donorId, churchId, merchantId, or any internal database ID. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  if (!checkSetupLinkRateLimit(`resolve:${ip}`)) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const tokenHash = hashSetupLinkToken(token);
  const link = await prisma.subscriptionSetupLink.findUnique({ where: { tokenHash } });

  if (!link) return NextResponse.json({ error: "This setup link is invalid." }, { status: 404 });
  if (link.status === "REVOKED") return NextResponse.json({ error: "This setup link has been revoked." }, { status: 410 });
  if (link.status === "COMPLETED") return NextResponse.json({ error: "This setup link has already been used." }, { status: 410 });
  if (link.expiresAt < new Date()) {
    if (link.status !== "EXPIRED") await prisma.subscriptionSetupLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    return NextResponse.json({ error: "This setup link has expired." }, { status: 410 });
  }

  if (!link.openedAt) {
    await prisma.subscriptionSetupLink.update({ where: { id: link.id }, data: { openedAt: new Date() } });
  }

  const church = await prisma.church.findUnique({ where: { id: link.churchId } });
  const fund = link.fundId ? await prisma.fund.findUnique({ where: { id: link.fundId } }) : null;

  return NextResponse.json({
    organizationName: church?.name || "this organization",
    organizationLogoUrl: church?.logoUrl || null,
    donorFirstName: link.donorFirstName,
    donorLastName: link.donorLastName,
    donorEmail: link.donorEmail,
    amountCents: link.amountCents,
    billingInterval: link.billingInterval,
    frequencyLabel: frequencyLabel(link.billingInterval),
    startDate: link.startDate,
    endDate: link.endDate,
    fundName: fund?.name || null,
    message: link.message,
    expiresAt: link.expiresAt,
  });
}
