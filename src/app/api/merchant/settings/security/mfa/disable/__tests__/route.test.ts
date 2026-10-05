import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({
  requireMerchantSession: () => mockAuth(),
}));

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    update: vi.fn().mockResolvedValue({}),
  },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockRecordWithdrawn = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/smsConsent", () => ({ recordSmsConsentWithdrawn: (...args: unknown[]) => mockRecordWithdrawn(...args) }));

const mockLogOtpEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/auth/otpAuditLog", () => ({ logOtpEvent: (...args: unknown[]) => mockLogOtpEvent(...args) }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/security/mfa/disable/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth.mockResolvedValue({ userId: "user-1", churchId: "church-a", rawRole: "owner", email: "owner@a.com", authTime: Math.floor(Date.now() / 1000) });
});

describe("POST /api/merchant/settings/security/mfa/disable — consent withdrawal", () => {
  it("records a WITHDRAWN consent event when disabling a user who had a phone on file", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: "+15550192837" });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { mfaEnabled: false } });
    expect(mockRecordWithdrawn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", churchId: "church-a", phone: "+15550192837", source: "settings_security_mfa_disable" })
    );
  });

  it("does not attempt to record a withdrawal for a user who never had a phone on file", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: null });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(mockRecordWithdrawn).not.toHaveBeenCalled();
  });

  it("logs an MFA_DISABLED OTP audit event", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ phone: "+15550192837" });
    const { POST } = await loadModule();
    await POST(new Request("http://x", { method: "POST" }));
    expect(mockLogOtpEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MFA_DISABLED", userId: "user-1", churchId: "church-a" })
    );
  });

  it("refuses to disable 2FA when the session is a 'View as Merchant' impersonation — never touches the DB", async () => {
    mockAuth.mockResolvedValue({
      userId: "admin-1",
      churchId: "church-a",
      rawRole: "wgc_super_admin",
      email: "admin@wgc.com",
      authTime: Math.floor(Date.now() / 1000),
      impersonation: { impersonationSessionId: "imp-1", adminUserId: "admin-1", adminEmail: "admin@wgc.com", targetChurchId: "church-a", targetChurchName: "Test Church" },
    });
    const { POST } = await loadModule();
    const res = await POST(new Request("http://x", { method: "POST" }));
    expect(res.status).toBe(403);
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
