import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ partner: { findUnique: vi.fn(), create: vi.fn(), findMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/partners/onboardingCode", () => ({ ensureOnboardingCode: vi.fn() }));
const requirePartnerAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/requirePartnerAdmin", () => ({ requirePartnerAdmin }));

import { POST } from "../route";
import { DEFAULT_PARTNER_PRICE_PER_MERCHANT_CENTS } from "@/lib/partners/partnerPricing";

const post = (body: unknown) => POST(new Request("https://wgc.test/api/admin/partners", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  requirePartnerAdmin.mockResolvedValue({ session: { email: "admin@wgc.test" } });
  prismaMock.partner.findUnique.mockResolvedValue(null);
  prismaMock.partner.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "p1", ...data }));
});

describe("POST /api/admin/partners", () => {
  it("starts a new partner at $10 per merchant per month", async () => {
    expect(DEFAULT_PARTNER_PRICE_PER_MERCHANT_CENTS).toBe(1000);
    const res = await post({ name: "Clear Vision Design & Marketing" });
    expect(res.status).toBe(201);
    expect(prismaMock.partner.create.mock.calls[0][0].data).toMatchObject({ slug: "clear-vision-design-marketing", pricePerMerchantCents: 1000 });
  });
});
