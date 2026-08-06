import { describe, it, expect, vi, beforeEach } from "vitest";

function makeCookieStore(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  return {
    get: (name: string) => (store.has(name) ? { value: store.get(name)! } : undefined),
    set: vi.fn((name: string, value: string) => store.set(name, value)),
    delete: vi.fn((name: string) => store.delete(name)),
    __store: store,
  };
}

describe("createPromotionLead / setPromotionLeadCookie — server-trusted lead creation", () => {
  it("creates a lead scoped to the Six Months Free promotion and returns a fresh raw token", async () => {
    vi.resetModules();
    const promotionFindUnique = vi.fn().mockResolvedValue({ id: "promo-1", code: "SIX_MONTHS_FREE_2026" });
    const leadCreate = vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: "lead-1", ...data }));
    vi.doMock("@/lib/prisma", () => ({
      prisma: { promotion: { findUnique: promotionFindUnique, create: vi.fn() }, promotionLead: { create: leadCreate } },
    }));
    const cookieStore = makeCookieStore();
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { createPromotionLead, setPromotionLeadCookie, PROMO_COOKIE_NAME } = await import("@/lib/billing/promotionAttribution");
    const { rawToken } = await createPromotionLead({ organizationName: "Test Church" });

    expect(leadCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ promotionId: "promo-1", status: "LEAD_CAPTURED" }) }),
    );
    expect(rawToken.length).toBeGreaterThan(20);

    await setPromotionLeadCookie(rawToken);
    expect(cookieStore.set).toHaveBeenCalledWith(
      PROMO_COOKIE_NAME,
      rawToken,
      expect.objectContaining({ httpOnly: true, sameSite: "lax" }),
    );
  });
});

describe("consumePromotionLeadForSignup — the only path that attributes a promotion", () => {
  it("a normal /start signup with NO cookie gets nothing — silently returns null", async () => {
    vi.resetModules();
    const findUnique = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update: vi.fn() } } }));
    const cookieStore = makeCookieStore(); // no cookie set
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("a valid, unexpired, unconsumed lead is attached to the OnboardingApplication", async () => {
    vi.resetModules();
    const lead = { id: "lead-1", promotionId: "promo-1", consumedAt: null, tokenExpiresAt: new Date(Date.now() + 60_000) };
    const findUnique = vi.fn().mockResolvedValue(lead);
    const update = vi.fn().mockResolvedValue({});
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update } } }));
    const cookieStore = makeCookieStore({ wgc_promo_lead: "raw-token-value" });
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toEqual({ leadId: "lead-1", promotionId: "promo-1" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lead-1" },
        data: expect.objectContaining({ onboardingApplicationId: "app-1", status: "SIGNUP_STARTED" }),
      }),
    );
    // The cookie is always cleared once consumed — cannot be replayed.
    expect(cookieStore.delete).toHaveBeenCalled();
  });

  it("query-parameter manipulation cannot qualify — only the cookie is ever consulted, never req.url", async () => {
    vi.resetModules();
    const findUnique = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update: vi.fn() } } }));
    const cookieStore = makeCookieStore(); // simulates a request with ?promo=SIX_MONTHS_FREE_2026 but no real cookie
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("an expired lead does not qualify, even with a technically-valid cookie", async () => {
    vi.resetModules();
    const lead = { id: "lead-1", promotionId: "promo-1", consumedAt: null, tokenExpiresAt: new Date(Date.now() - 60_000) };
    const findUnique = vi.fn().mockResolvedValue(lead);
    const update = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update } } }));
    const cookieStore = makeCookieStore({ wgc_promo_lead: "raw-token-value" });
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("an already-consumed lead cannot be replayed for a second signup", async () => {
    vi.resetModules();
    const lead = { id: "lead-1", promotionId: "promo-1", consumedAt: new Date(), tokenExpiresAt: new Date(Date.now() + 60_000) };
    const findUnique = vi.fn().mockResolvedValue(lead);
    const update = vi.fn();
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update } } }));
    const cookieStore = makeCookieStore({ wgc_promo_lead: "raw-token-value" });
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
  });

  it("a bogus/manually-typed cookie value that matches no lead is silently rejected", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue(null);
    vi.doMock("@/lib/prisma", () => ({ prisma: { promotionLead: { findUnique, update: vi.fn() } } }));
    const cookieStore = makeCookieStore({ wgc_promo_lead: "someone-guessed-this" });
    vi.doMock("next/headers", () => ({ cookies: async () => cookieStore }));

    const { consumePromotionLeadForSignup } = await import("@/lib/billing/promotionAttribution");
    const result = await consumePromotionLeadForSignup("app-1");

    expect(result).toBeNull();
  });
});
