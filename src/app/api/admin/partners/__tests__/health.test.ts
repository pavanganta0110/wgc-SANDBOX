import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const admin = vi.hoisted(() => ({ requirePartnerAdmin: vi.fn() }));
const prismaMock = vi.hoisted(() => ({
  partner: { findMany: vi.fn() },
  partnerApiKey: { groupBy: vi.fn() },
  partnerWebhookEndpoint: { findMany: vi.fn() },
  partnerWebhookDelivery: { groupBy: vi.fn(), findMany: vi.fn() },
  partnerEmbedLinkRequest: { groupBy: vi.fn() },
  webhookEvent: { findMany: vi.fn() },
  partnerEvent: { findMany: vi.fn() },
}));
vi.mock("@/lib/partners/requirePartnerAdmin", () => admin);
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/partners/onboardingCode", () => ({ ensureOnboardingCode: vi.fn(async () => "ob_x"), generateOnboardingCode: vi.fn() }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn() }));

import { GET } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  admin.requirePartnerAdmin.mockResolvedValue({ session: { email: "a@wgc.test" } });
  prismaMock.partner.findMany.mockResolvedValue([
    { id: "p1", name: "Clear Vision", slug: "cv", status: "ACTIVE", contactEmail: null, suppressMerchantEmails: true, onboardingCode: "ob_x", pricePerMerchantCents: 1000, cardBrand: null, cardLast4: null, createdAt: new Date(), users: [], churches: [], invoices: [] },
    { id: "p2", name: "Quiet Partner", slug: "q", status: "ACTIVE", contactEmail: null, suppressMerchantEmails: false, onboardingCode: "ob_y", pricePerMerchantCents: null, cardBrand: null, cardLast4: null, createdAt: new Date(), users: [], churches: [], invoices: [] },
  ]);
  prismaMock.partnerApiKey.groupBy.mockResolvedValue([{ partnerId: "p1", _count: { _all: 1 }, _sum: { errorCount: 3, requestCount: 40 }, _max: { lastUsedAt: new Date("2026-10-29T10:00:00Z"), lastErrorAt: null } }]);
  prismaMock.partnerWebhookEndpoint.findMany.mockResolvedValue([{ partnerId: "p1", url: "https://wgc.cvprotools.com/webhook?secret=zzz", status: "DISABLED_AUTO", consecutiveFailures: 20, disabledReason: "Too many failures", lastDeliveryAt: null, lastSuccessAt: null }]);
  prismaMock.partnerWebhookDelivery.groupBy.mockResolvedValue([{ partnerId: "p1", status: "SUCCEEDED", _count: { _all: 5 } }, { partnerId: "p1", status: "FAILED", _count: { _all: 2 } }, { partnerId: "p1", status: "ABANDONED", _count: { _all: 1 } }]);
  prismaMock.partnerWebhookDelivery.findMany.mockResolvedValue([{ id: "d1", partnerId: "p1", status: "FAILED", attemptCount: 3, responseStatusCode: 500, errorMessage: "HTTP 500", createdAt: new Date(), webhookEventId: null, partnerEventId: "e1" }]);
  prismaMock.partnerEmbedLinkRequest.groupBy.mockResolvedValue([{ partnerId: "p1", _count: { _all: 12 } }]);
  prismaMock.webhookEvent.findMany.mockResolvedValue([]);
  prismaMock.partnerEvent.findMany.mockResolvedValue([{ id: "e1", type: "onboarding.approved" }]);
});

describe("GET /api/admin/partners: connection health", () => {
  it("is for super admins only", async () => {
    admin.requirePartnerAdmin.mockResolvedValue({ response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await GET()).status).toBe(403);
    expect(prismaMock.partner.findMany).not.toHaveBeenCalled();
  });

  it("reports each partner's key, webhook, deliveries and link requests", async () => {
    const body = await (await GET()).json();
    const h = body.partners[0].health;
    expect(h.apiKey).toMatchObject({ activeKeys: 1, requests: 40, errors: 3 });
    expect(h.webhook).toMatchObject({ status: "DISABLED_AUTO", consecutiveFailures: 20, succeeded24h: 5, failed24h: 3, disabledReason: "Too many failures" });
    expect(h.linkRequests24h).toBe(12);
    expect(h.recentDeliveries[0]).toMatchObject({ eventType: "onboarding.approved", status: "FAILED", statusCode: 500, attempts: 3 });
  });

  it("shows only the host of the webhook address, never its path or query", async () => {
    const body = await (await GET()).json();
    expect(body.partners[0].health.webhook.host).toBe("wgc.cvprotools.com");
    expect(JSON.stringify(body)).not.toContain("secret=zzz");
  });

  it("a partner with nothing set up has empty health, not an error", async () => {
    const body = await (await GET()).json();
    expect(body.partners[1].health).toMatchObject({ apiKey: { activeKeys: 0 }, webhook: null, linkRequests24h: 0, recentDeliveries: [] });
  });
});
