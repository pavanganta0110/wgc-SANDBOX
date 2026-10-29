import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ partnerUser: { update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/audit", () => ({ createAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "9.9.9.9" }) }));
vi.mock("@/lib/auth/merchantAuthRateLimit", () => ({ checkMerchantAuthRateLimit: () => true }));
const verifyPartnerLogin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerAccounts", () => ({ verifyPartnerLogin }));
const setPartnerSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/partnerSession", () => ({ setPartnerSessionCookie }));
const mfa = vi.hoisted(() => ({ startPartnerMfa: vi.fn(), verifyPartnerMfa: vi.fn(), isPartnerMfaDisabled: vi.fn(), maskEmail: (e: string) => "d•••@" + e.split("@")[1] }));
vi.mock("@/lib/partners/partnerMfa", () => mfa);

import { POST as login } from "../route";
import { POST as verify } from "../verify/route";

const post = (handler: (r: Request) => Promise<Response>, body: unknown) => handler(new Request("https://wgc.test/x", { method: "POST", body: JSON.stringify(body) }));
const user = { id: "u1", partnerId: "p1", email: "david@example.test", authVersion: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  mfa.isPartnerMfaDisabled.mockReturnValue(false);
  verifyPartnerLogin.mockResolvedValue(user);
  mfa.startPartnerMfa.mockResolvedValue({ challengeId: "chal_1", sent: true });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/partner/login", () => {
  it("with the right password it asks for the emailed code and starts NO session", async () => {
    const res = await post(login, { email: "david@example.test", password: "correct horse battery" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mfaRequired: true, challengeId: "chal_1", maskedEmail: "d•••@example.test" });
    expect(setPartnerSessionCookie).not.toHaveBeenCalled();
  });

  it("with the wrong password it answers 401 and sends no code", async () => {
    verifyPartnerLogin.mockResolvedValue(null);
    expect((await post(login, { email: "david@example.test", password: "nope" })).status).toBe(401);
    expect(mfa.startPartnerMfa).not.toHaveBeenCalled();
  });

  it("does not sign anyone in when the code could not be sent", async () => {
    mfa.startPartnerMfa.mockResolvedValue({ challengeId: "chal_1", sent: false });
    expect((await post(login, { email: "david@example.test", password: "x" })).status).toBe(502);
    expect(setPartnerSessionCookie).not.toHaveBeenCalled();
  });

  it("the development switch signs in directly", async () => {
    mfa.isPartnerMfaDisabled.mockReturnValue(true);
    prismaMock.partnerUser.update.mockResolvedValue({});
    expect((await post(login, { email: "david@example.test", password: "x" })).status).toBe(200);
    expect(setPartnerSessionCookie).toHaveBeenCalledWith(user);
    expect(mfa.startPartnerMfa).not.toHaveBeenCalled();
  });
});

describe("POST /api/partner/login/verify", () => {
  it("starts the session only after a good code", async () => {
    mfa.verifyPartnerMfa.mockResolvedValue({ ok: true, user });
    const res = await post(verify, { challengeId: "chal_1", code: "123456" });
    expect(res.status).toBe(200);
    expect(setPartnerSessionCookie).toHaveBeenCalledWith(user);
  });

  it("refuses a bad, expired or locked code and starts no session", async () => {
    for (const [reason, status] of [["invalid", 401], ["expired", 401], ["locked", 429]] as const) {
      mfa.verifyPartnerMfa.mockResolvedValue({ ok: false, reason });
      expect((await post(verify, { challengeId: "chal_1", code: "000000" })).status, reason).toBe(status);
    }
    expect(setPartnerSessionCookie).not.toHaveBeenCalled();
  });
});
