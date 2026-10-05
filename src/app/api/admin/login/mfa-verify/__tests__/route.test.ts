import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashMfaCode } from "@/lib/auth/mfaCode";

const mockFindFirst = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: (...args: unknown[]) => mockFindFirst(...args), update: (...args: unknown[]) => mockUpdate(...args) } },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockCheckRateLimit = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/auth/adminAuthRateLimit", () => ({ checkAdminAuthRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args) }));

const mockCompleteAdminLogin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/completeAdminLogin", () => ({ completeAdminLogin: (...args: unknown[]) => mockCompleteAdminLogin(...args) }));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/admin/login/mfa-verify/route");
}

function req(challengeId: string, code: string) {
  return new Request("http://x/api/admin/login/mfa-verify", { method: "POST", body: JSON.stringify({ challengeId, code }) });
}

const CODE = "654321";

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(true);
});

describe("POST /api/admin/login/mfa-verify — role-scoped challenge lookup", () => {
  it("looks up the challenge scoped to admin roles only — a merchant's challengeId could never be consumed here", async () => {
    mockFindFirst.mockResolvedValue(null);
    const { POST } = await loadModule();
    await POST(req("some-challenge", CODE));
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: { mfaLoginChallengeId: "some-challenge", role: { in: ["wgc_admin", "wgc_super_admin"] } },
    });
  });

  it("issues an admin session via completeAdminLogin (never completeMerchantLogin) on a correct code", async () => {
    mockFindFirst.mockResolvedValue({
      id: "admin-1",
      email: "admin@wgc.com",
      role: "wgc_admin",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      disabledAt: null,
    });
    const { POST } = await loadModule();
    const res = await POST(req("challenge-1", CODE));
    expect(res.status).toBe(200);
    expect(mockCompleteAdminLogin).toHaveBeenCalledTimes(1);
    // mfaVerified must be true — this is the ONLY path that should ever
    // pass true, since the code was just checked above.
    expect(mockCompleteAdminLogin).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "1.2.3.4", "test-agent", true);
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "ADMIN_LOGIN_2FA_SUCCESS" }));
  });

  it("refuses a disabled admin account even with a correct code", async () => {
    mockFindFirst.mockResolvedValue({
      id: "admin-1",
      email: "admin@wgc.com",
      role: "wgc_admin",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      disabledAt: new Date(),
    });
    const { POST } = await loadModule();
    const res = await POST(req("challenge-1", CODE));
    expect(res.status).toBe(403);
    expect(mockCompleteAdminLogin).not.toHaveBeenCalled();
  });
});
