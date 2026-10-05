import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn().mockResolvedValue({});
const mockAuditCreate = vi.fn().mockResolvedValue({});
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...args: unknown[]) => mockFindUnique(...args), update: (...args: unknown[]) => mockUpdate(...args) },
    auditLog: { create: (...args: unknown[]) => mockAuditCreate(...args) },
  },
}));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockCheckRateLimit = vi.fn((..._args: unknown[]) => true);
vi.mock("@/lib/auth/adminAuthRateLimit", () => ({ checkAdminAuthRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args) }));

const mockVerifyPassword = vi.fn();
vi.mock("@/lib/auth/password", () => ({ verifyPassword: (...args: unknown[]) => mockVerifyPassword(...args) }));

const mockCompleteAdminLogin = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/completeAdminLogin", () => ({ completeAdminLogin: (...args: unknown[]) => mockCompleteAdminLogin(...args) }));

const mockSendAuthSms = vi.fn();
vi.mock("@/lib/sms/authSmsSender", () => ({ sendAuthSms: (...args: unknown[]) => mockSendAuthSms(...args) }));

const mockCheckLimits = vi.fn();
const mockRecordSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpSendLimits", () => ({
  checkOtpSendLimits: (...args: unknown[]) => mockCheckLimits(...args),
  recordOtpSend: (...args: unknown[]) => mockRecordSend(...args),
  otpSendLimitMessage: () => "Too many verification code requests. Please try again later.",
}));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/admin/login/route");
}

function req(email: string, password: string) {
  return new Request("http://x/api/admin/login", { method: "POST", body: JSON.stringify({ email, password }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockReturnValue(true);
  mockVerifyPassword.mockResolvedValue(true);
  mockCheckLimits.mockResolvedValue({ allowed: true });
  mockSendAuthSms.mockResolvedValue({ success: true, providerMessageId: "SM1" });
});

describe("POST /api/admin/login — a session is only ever issued as mfaVerified: true after OTP, never at password-only time for an enrolled account", () => {
  it("a not-yet-enrolled admin (mfaEnabled: false) gets a session issued immediately, with mfaVerified: false", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@wgc.com",
      role: "wgc_admin",
      passwordHash: "hash",
      disabledAt: null,
      mfaEnabled: false,
      phone: null,
      passwordChangedAt: null,
    });
    const { POST } = await loadModule();
    const res = await POST(req("admin@wgc.com", "correct-password"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mfaSetupRequired).toBe(true);
    expect(mockCompleteAdminLogin).toHaveBeenCalledWith(expect.objectContaining({ id: "admin-1" }), "1.2.3.4", "test-agent", false);
  });

  it("an enrolled admin (mfaEnabled: true) never gets a session at this step — only a challengeId, no completeAdminLogin call", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@wgc.com",
      role: "wgc_admin",
      passwordHash: "hash",
      disabledAt: null,
      mfaEnabled: true,
      phone: "+15551234567",
      passwordChangedAt: null,
    });
    const { POST } = await loadModule();
    const res = await POST(req("admin@wgc.com", "correct-password"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.mfaRequired).toBe(true);
    expect(typeof data.challengeId).toBe("string");
    expect(mockCompleteAdminLogin).not.toHaveBeenCalled();
  });

  it("an incorrect password never reaches completeAdminLogin regardless of MFA status", async () => {
    mockFindUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin@wgc.com",
      role: "wgc_admin",
      passwordHash: "hash",
      disabledAt: null,
      mfaEnabled: false,
      phone: null,
      passwordChangedAt: null,
    });
    mockVerifyPassword.mockResolvedValue(false);
    const { POST } = await loadModule();
    const res = await POST(req("admin@wgc.com", "wrong-password"));
    expect(res.status).toBe(401);
    expect(mockCompleteAdminLogin).not.toHaveBeenCalled();
  });
});
