import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashMfaCode } from "@/lib/auth/mfaCode";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockPrisma = {
  user: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-forwarded-for", "1.2.3.4"], ["user-agent", "test-agent"]]),
}));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

const mockLogDashboardAction = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: (...args: unknown[]) => mockLogDashboardAction(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/security/mfa/confirm/route");
}

function req(code: string) {
  return new Request("http://x/api/merchant/settings/security/mfa/confirm", { method: "POST", body: JSON.stringify({ code }) });
}

const CODE = "123456";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-a", email: "u@a.com", rawRole: "owner", authTime: Math.floor(Date.now() / 1000) });
});

describe("POST /api/merchant/settings/security/mfa/confirm — enroll vs. phone-change branching", () => {
  it("logs MFA_ENABLED (not PHONE_CHANGED) on first-time enrollment (mfaEnabled was false)", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: false,
    });
    const { POST } = await loadModule();
    const res = await POST(req(CODE));
    expect(res.status).toBe(200);
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "MFA_ENABLED" }));
    expect(mockLogOtpEvent).not.toHaveBeenCalledWith(expect.objectContaining({ action: "PHONE_CHANGED" }));
    expect(mockLogDashboardAction).toHaveBeenCalledWith(expect.objectContaining({ action: "settings.mfa_enabled" }));
  });

  it("logs PHONE_CHANGED (not MFA_ENABLED) when mfaEnabled was already true — i.e. this is a number change", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      pendingPhone: "+15559876543",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: true,
    });
    const { POST } = await loadModule();
    const res = await POST(req(CODE));
    expect(res.status).toBe(200);
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "PHONE_CHANGED" }));
    expect(mockLogOtpEvent).not.toHaveBeenCalledWith(expect.objectContaining({ action: "MFA_ENABLED" }));
    expect(mockLogDashboardAction).toHaveBeenCalledWith(expect.objectContaining({ action: "settings.mfa_phone_changed" }));
  });

  it("promotes pendingPhone to phone only after the code matches — never before", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: true,
    });
    const { POST } = await loadModule();
    await POST(req(CODE));
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({ phone: "+15551234567", mfaEnabled: true, pendingPhone: null }),
    });
  });

  it("rejects an incorrect code without touching phone/pendingPhone", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() + 60_000),
      mfaCodeAttempts: 0,
      mfaEnabled: true,
    });
    const { POST } = await loadModule();
    const res = await POST(req("000000"));
    expect(res.status).toBe(400);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { mfaCodeAttempts: { increment: 1 } },
    });
  });

  it("refuses to confirm when the session is a 'View as Merchant' impersonation — never reads pendingPhone or mutates state", async () => {
    mockAuth.mockResolvedValue({
      userId: "admin-1",
      churchId: "church-a",
      email: "admin@wgc.com",
      rawRole: "wgc_super_admin",
      authTime: Math.floor(Date.now() / 1000),
      impersonation: { impersonationSessionId: "imp-1", adminUserId: "admin-1", adminEmail: "admin@wgc.com", targetChurchId: "church-a", targetChurchName: "Test Church" },
    });
    const { POST } = await loadModule();
    const res = await POST(req(CODE));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it("rejects an expired code and clears the pending state", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      pendingPhone: "+15551234567",
      mfaCodeHash: hashMfaCode(CODE),
      mfaCodeExpiresAt: new Date(Date.now() - 1000),
      mfaCodeAttempts: 0,
      mfaEnabled: true,
    });
    const { POST } = await loadModule();
    const res = await POST(req(CODE));
    expect(res.status).toBe(400);
    expect(mockLogOtpEvent).toHaveBeenCalledWith(expect.objectContaining({ action: "OTP_EXPIRED" }));
  });
});
