import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  onboardingApplication: { create: vi.fn() },
  partnerAgent: { findFirst: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/finix/client", () => ({ finixClient: {} }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn(), sendWgcAdminOnboardingNotification: vi.fn() }));
vi.mock("@/lib/billing/promotionAttribution", () => ({ consumePromotionLeadForSignup: vi.fn() }));
vi.mock("@/lib/partners/onboardingEvents", () => ({ notifyPartnerOfOnboardingStage: vi.fn() }));
vi.mock("@/lib/auth/framePasscode", () => ({ hashFramePasscode: vi.fn(), validateFramePasscode: vi.fn(() => null) }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: vi.fn() })), cookies: vi.fn(async () => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn() })) }));
const resolvePartner = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/onboardingCode", () => ({ resolvePartnerByOnboardingCode: resolvePartner }));
const loadState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/loadEmbedState", () => ({ loadPartnerEmbedState: loadState }));

import { POST } from "../route";

const post = (body: Record<string, unknown>) => POST(new Request("https://wgc.test/api/onboarding", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RECAPTCHA_SECRET_KEY = "";
  resolvePartner.mockResolvedValue({ id: "p1", suppressMerchantEmails: false, embedSignInMode: "EMAIL_CODE" });
});

describe("POST /api/onboarding with a partner reference", () => {
  it.each([
    [{ kind: "ready", churchId: "c1", organizationName: "Existing" }],
    [{ kind: "setting_up", organizationName: "Existing" }],
    [{ kind: "pending", stage: "submitted", organizationName: "Existing" }],
    [{ kind: "information_required", organizationName: "Existing", items: [] }],
    [{ kind: "rejected", organizationName: "Existing" }],
  ])("refuses a second application for a reference that already has one (%o)", async (state) => {
    loadState.mockResolvedValue(state);
    const res = await post({ partnerCode: "CODE1234", partnerReference: "loc_1", organizationName: "Second" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("reference_in_use");
    expect(loadState).toHaveBeenCalledWith("p1", "loc_1");
    expect(prismaMock.onboardingApplication.create).not.toHaveBeenCalled();
  });

  it("does not look the reference up for an ordinary application with no partner or no reference", async () => {
    resolvePartner.mockResolvedValue(null);
    await post({ organizationName: "Plain" }).catch(() => undefined);
    resolvePartner.mockResolvedValue({ id: "p1", suppressMerchantEmails: false, embedSignInMode: "EMAIL_CODE" });
    await post({ partnerCode: "CODE1234", organizationName: "No ref" }).catch(() => undefined);
    expect(loadState).not.toHaveBeenCalled();
  });

  it("lets a new organization (the form state) continue past the guard", async () => {
    loadState.mockResolvedValue({ kind: "form" });
    const res = await post({ partnerCode: "CODE1234", partnerReference: "loc_new", organizationName: "New" }).catch(() => null);
    // it goes on to the normal checks; the guard itself must not return 409
    expect(res?.status).not.toBe(409);
    expect(loadState).toHaveBeenCalledWith("p1", "loc_new");
  });
});
