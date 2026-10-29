import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAuditLog } from "@/lib/audit";
import { requirePartnerAdmin } from "@/lib/partners/requirePartnerAdmin";
import { slugifyPartnerName } from "@/lib/partners/partnerAccounts";
import { isValidEmail } from "@/lib/donors/donorContact";
import { ensureOnboardingCode } from "@/lib/partners/onboardingCode";
import { DEFAULT_PARTNER_PRICE_PER_MERCHANT_CENTS } from "@/lib/partners/partnerPricing";

export async function GET() {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;

  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      contactEmail: true,
      suppressMerchantEmails: true,
      onboardingCode: true,
      pricePerMerchantCents: true,
      cardBrand: true,
      cardLast4: true,
      createdAt: true,
      users: { select: { id: true, email: true, name: true, passwordHash: true, disabledAt: true, lastLoginAt: true }, orderBy: { createdAt: "asc" } },
      churches: { select: { id: true, name: true, partnerReference: true }, orderBy: { name: "asc" } },
      invoices: { select: { id: true, period: true, merchantCount: true, amountCents: true, status: true, failureReason: true }, orderBy: { period: "desc" }, take: 6 },
    },
  });

  // The code for the partner's Get Started links is made the first time WGC looks for it.
  // WGC gives it to the partner; it is not shown in the partner's own dashboard.
  const withCodes = await Promise.all(partners.map(async (p) => ({ ...p, onboardingCode: p.onboardingCode ?? (await ensureOnboardingCode(p.id)) })));

  return NextResponse.json({
    partners: withCodes.map((p) => ({
      ...p,
      users: p.users.map(({ passwordHash, ...u }) => ({ ...u, invitePending: !passwordHash })),
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requirePartnerAdmin();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const contactEmail = typeof body.contactEmail === "string" && body.contactEmail.trim() ? body.contactEmail.trim().toLowerCase() : null;
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Enter the partner's name." }, { status: 400 });
  }
  if (contactEmail && !isValidEmail(contactEmail)) {
    return NextResponse.json({ error: "Enter a valid contact email." }, { status: 400 });
  }

  const slug = slugifyPartnerName(typeof body.slug === "string" && body.slug.trim() ? body.slug : name);
  if (!slug) {
    return NextResponse.json({ error: "Could not make a short name from that. Enter one using letters and numbers." }, { status: 400 });
  }
  if (await prisma.partner.findUnique({ where: { slug }, select: { id: true } })) {
    return NextResponse.json({ error: "A partner with that short name already exists." }, { status: 409 });
  }

  const partner = await prisma.partner.create({ data: { name, slug, contactEmail, pricePerMerchantCents: DEFAULT_PARTNER_PRICE_PER_MERCHANT_CENTS } });
  await createAuditLog({
    action: "PARTNER_CREATED",
    actorEmail: auth.session.email,
    metadata: { partnerId: partner.id, slug, pricePerMerchantCents: DEFAULT_PARTNER_PRICE_PER_MERCHANT_CENTS },
  });
  return NextResponse.json({ partner }, { status: 201 });
}
