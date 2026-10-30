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
      embedSignInMode: true,
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

  // How each partner's connection is doing, so a stuck key or webhook shows up here and not only in the partner's own dashboard.
  const ids = partners.map((p) => p.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [keyRows, endpoints, deliveryCounts, latestDeliveries, linkRequests] = await Promise.all([
    prisma.partnerApiKey.groupBy({ by: ["partnerId"], where: { partnerId: { in: ids }, status: "ACTIVE" }, _count: { _all: true }, _sum: { errorCount: true, requestCount: true }, _max: { lastUsedAt: true, lastErrorAt: true } }),
    prisma.partnerWebhookEndpoint.findMany({ where: { partnerId: { in: ids } }, select: { partnerId: true, url: true, status: true, consecutiveFailures: true, disabledReason: true, lastDeliveryAt: true, lastSuccessAt: true } }),
    prisma.partnerWebhookDelivery.groupBy({ by: ["partnerId", "status"], where: { partnerId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.partnerWebhookDelivery.findMany({
      where: { partnerId: { in: ids } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, partnerId: true, status: true, attemptCount: true, responseStatusCode: true, errorMessage: true, createdAt: true, webhookEventId: true, partnerEventId: true },
    }),
    prisma.partnerEmbedLinkRequest.groupBy({ by: ["partnerId"], where: { partnerId: { in: ids }, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const eventIds = latestDeliveries.flatMap((d) => (d.webhookEventId ? [d.webhookEventId] : []));
  const partnerEventIds = latestDeliveries.flatMap((d) => (d.partnerEventId ? [d.partnerEventId] : []));
  const [orgEvents, partnerEvents] = await Promise.all([
    prisma.webhookEvent.findMany({ where: { id: { in: eventIds } }, select: { id: true, type: true } }),
    prisma.partnerEvent.findMany({ where: { id: { in: partnerEventIds } }, select: { id: true, type: true } }),
  ]);
  const typeOf = new Map<string, string>([...orgEvents, ...partnerEvents].map((e) => [e.id, e.type]));
  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return null;
    }
  };

  const health = (partnerId: string) => {
    const key = keyRows.find((k) => k.partnerId === partnerId);
    const endpoint = endpoints.find((e) => e.partnerId === partnerId);
    const count = (status: string[]) => deliveryCounts.filter((d) => d.partnerId === partnerId && status.includes(d.status)).reduce((a, d) => a + d._count._all, 0);
    return {
      apiKey: { activeKeys: key?._count._all ?? 0, requests: key?._sum.requestCount ?? 0, errors: key?._sum.errorCount ?? 0, lastUsedAt: key?._max.lastUsedAt ?? null, lastErrorAt: key?._max.lastErrorAt ?? null },
      webhook: endpoint
        ? {
            host: hostOf(endpoint.url),
            status: endpoint.status,
            consecutiveFailures: endpoint.consecutiveFailures,
            disabledReason: endpoint.disabledReason,
            lastDeliveryAt: endpoint.lastDeliveryAt,
            lastSuccessAt: endpoint.lastSuccessAt,
            succeeded24h: count(["SUCCEEDED"]),
            failed24h: count(["FAILED", "ABANDONED"]),
          }
        : null,
      linkRequests24h: linkRequests.find((l) => l.partnerId === partnerId)?._count._all ?? 0,
      recentDeliveries: latestDeliveries
        .filter((d) => d.partnerId === partnerId)
        .slice(0, 8)
        .map((d) => ({ id: d.id, eventType: typeOf.get(d.webhookEventId ?? d.partnerEventId ?? "") ?? null, status: d.status, attempts: d.attemptCount, statusCode: d.responseStatusCode, error: d.errorMessage, at: d.createdAt })),
    };
  };

  return NextResponse.json({
    partners: withCodes.map((p) => ({
      ...p,
      users: p.users.map(({ passwordHash, ...u }) => ({ ...u, invitePending: !passwordHash })),
      health: health(p.id),
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
