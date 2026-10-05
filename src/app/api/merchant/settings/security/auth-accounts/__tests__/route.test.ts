import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getSession: () => mockGetSession() }));

const mockResolveActiveImpersonation = vi.fn();
vi.mock("@/lib/auth/impersonation", () => ({ resolveActiveImpersonation: (...args: unknown[]) => mockResolveActiveImpersonation(...args) }));

const mockPrisma = {
  user: { findUnique: vi.fn() },
  authAccount: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  dashboardAuditLog: { findMany: vi.fn(), create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

vi.mock("@/lib/sms/authSmsSender", () => ({ isAuthSmsConfigured: () => true }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/merchant/settings/security/auth-accounts/route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ userId: "user-1", email: "u@a.com", churchId: "church-a", role: "owner", authTime: Math.floor(Date.now() / 1000) });
  mockResolveActiveImpersonation.mockResolvedValue(null);
});

describe("GET /api/merchant/settings/security/auth-accounts", () => {
  it("returns the real account's identity fields for a normal (non-impersonated) session", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: "hash", mfaEnabled: true, phone: "+15550192837" });
    mockPrisma.authAccount.findMany.mockResolvedValue([{ provider: "google" }]);
    mockPrisma.dashboardAuditLog.findMany.mockResolvedValue([]);

    const { GET } = await loadModule();
    const res = await GET();
    const data = await res.json();
    expect(data.mfaEnabled).toBe(true);
    expect(data.hasPassword).toBe(true);
    expect(data.connectedProviders).toEqual(["google"]);
    expect(data.impersonating).toBeUndefined();
  });

  it("blanks every personal-identity field during a 'View as Merchant' impersonation session — never leaks the ADMIN's own phone/MFA/password status", async () => {
    mockResolveActiveImpersonation.mockResolvedValue({
      impersonationSessionId: "imp-1",
      adminUserId: "user-1",
      adminEmail: "admin@wgc.com",
      targetChurchId: "church-a",
      targetChurchName: "Test Church",
    });
    // Even if the DB lookup would return the admin's own real data, it
    // must never be reached/returned once impersonation is detected.
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: "hash", mfaEnabled: true, phone: "+15559998888" });

    const { GET } = await loadModule();
    const res = await GET();
    const data = await res.json();
    expect(data).toEqual({
      connectedProviders: [],
      hasPassword: false,
      recentActivity: [],
      recentAuthTime: null,
      mfaEnabled: false,
      maskedPhone: null,
      mfaAvailable: false,
      impersonating: true,
    });
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/merchant/settings/security/auth-accounts", () => {
  function req(provider: string) {
    return new Request("http://x", { method: "DELETE", body: JSON.stringify({ provider }) });
  }

  it("disconnects a provider for a normal session", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ passwordHash: "hash", role: "owner", email: "u@a.com" });
    mockPrisma.authAccount.count.mockResolvedValue(1);
    mockPrisma.authAccount.deleteMany.mockResolvedValue({ count: 1 });

    const { DELETE } = await loadModule();
    const res = await DELETE(req("google"));
    expect(res.status).toBe(200);
    expect(mockPrisma.authAccount.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1", provider: "google" } });
  });

  it("refuses to disconnect anything during impersonation — never touches authAccount", async () => {
    mockResolveActiveImpersonation.mockResolvedValue({
      impersonationSessionId: "imp-1",
      adminUserId: "user-1",
      adminEmail: "admin@wgc.com",
      targetChurchId: "church-a",
      targetChurchName: "Test Church",
    });

    const { DELETE } = await loadModule();
    const res = await DELETE(req("google"));
    expect(res.status).toBe(403);
    expect(mockPrisma.authAccount.deleteMany).not.toHaveBeenCalled();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });
});
