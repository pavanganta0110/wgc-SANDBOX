import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }) }));
vi.mock("@/lib/auth/merchantAuthRateLimit", () => ({ checkMerchantAuthRateLimit: () => true }));
const createPartnerPasswordReset = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerAccounts", () => ({ createPartnerPasswordReset, PARTNER_RESET_TTL_MINUTES: 60 }));
const sendEmail = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: sendEmail }));

import { POST } from "../route";

const post = (body: unknown) => POST(new Request("https://wgc.test/api/partner/forgot-password", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => vi.clearAllMocks());

describe("POST /api/partner/forgot-password", () => {
  it("answers the same whether or not the email has an account", async () => {
    createPartnerPasswordReset.mockResolvedValue({ rawToken: "tok", email: "david@example.test", name: null });
    const known = await post({ email: "david@example.test" });
    createPartnerPasswordReset.mockResolvedValue(null);
    const unknown = await post({ email: "nobody@example.test" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.json()).toEqual(await unknown.json());
  });

  it("emails a link only when there is an account to reset", async () => {
    createPartnerPasswordReset.mockResolvedValue(null);
    await post({ email: "nobody@example.test" });
    expect(sendEmail).not.toHaveBeenCalled();

    createPartnerPasswordReset.mockResolvedValue({ rawToken: "tok123", email: "david@example.test", name: null });
    await post({ email: "david@example.test" });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].to).toBe("david@example.test");
    expect(sendEmail.mock.calls[0][0].bodyHtml).toContain("/partner/reset-password/tok123");
  });

  it("still answers generically if sending fails, and needs an email", async () => {
    createPartnerPasswordReset.mockRejectedValue(new Error("db down"));
    expect((await post({ email: "david@example.test" })).status).toBe(200);
    expect((await post({})).status).toBe(400);
  });
});
