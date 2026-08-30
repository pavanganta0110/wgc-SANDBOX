import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Covers the "View as Merchant" branch added to requireMerchantSession() —
 * the single centralized resolver ~50+ merchant pages/routes already call.
 * Every case here proves either (a) a valid impersonation is admitted with
 * the target church's context, or (b) some invalid/expired/mismatched/
 * disabled condition still results in the exact same rejection a raw admin
 * session has always gotten — i.e. this branch never silently falls back to
 * treating the admin as themselves.
 */

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));

const prismaMock = {
  user: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  adminImpersonationSession: { findUnique: vi.fn(), updateMany: vi.fn() },
  wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadModules() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const impersonationModule = await import("@/lib/auth/impersonation");
  const resolverModule = await import("@/lib/auth/requireMerchantSession");
  return { ...sessionModule, ...impersonationModule, ...resolverModule };
}

function adminUser(id: string, role: "wgc_admin" | "wgc_super_admin" = "wgc_super_admin", overrides: Record<string, unknown> = {}) {
  return { id, email: `${id}@wgcpayments.com`, churchId: null, role, disabledAt: null, authVersion: 1, permissionsJson: null, ...overrides };
}

function activeChurch(id = "church-target", overrides: Record<string, unknown> = {}) {
  return { id, name: "Target Church", status: "ACTIVE", ...overrides };
}

function impersonationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "imp-session-1",
    adminUserId: "admin-1",
    adminEmail: "admin-1@wgcpayments.com",
    targetChurchId: "church-target",
    targetChurchName: "Target Church",
    startedAt: new Date(),
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    endedAt: null,
    endedReason: null,
    ...overrides,
  };
}

/** Sets up both cookies (real admin session + impersonation) on the mock store. */
function setCookies(sessionToken: string, impersonationToken?: string) {
  mockCookieStore.get.mockImplementation((name: string) => {
    if (name === "wgc_session") return { value: sessionToken };
    if (name === "wgc_impersonation") return impersonationToken ? { value: impersonationToken } : undefined;
    return undefined;
  });
}

describe("requireMerchantSession() — View as Merchant impersonation branch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("admits a valid impersonation cookie + active DB session + active target church", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1"));
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue(impersonationRow());
    prismaMock.church.findUnique.mockResolvedValue(activeChurch());

    const auth = await requireMerchantSession(true);
    expect(auth.churchId).toBe("church-target");
    expect(auth.role).toBe("owner");
    expect(auth.isWgcAdmin).toBe(true);
    expect(auth.impersonation?.adminUserId).toBe("admin-1");
    expect(auth.impersonation?.impersonationSessionId).toBe("imp-session-1");
  });

  it("raw wgc_admin session with NO impersonation cookie is still rejected (regression guard)", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_admin", churchId: null, authVersion: 1 });
    setCookies(sessionToken, undefined);
    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1", "wgc_admin"));

    await expect(requireMerchantSession()).rejects.toThrow(/WGC internal accounts cannot access/);
  });

  it("impersonation session already ended (endedAt set) is rejected", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1"));
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue(impersonationRow({ endedAt: new Date() }));

    await expect(requireMerchantSession()).rejects.toThrow(/WGC internal accounts cannot access/);
    expect(prismaMock.church.findUnique).not.toHaveBeenCalled();
  });

  it("impersonation session past its DB-level expiresAt is rejected, even if the cookie's own exp hasn't passed", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1"));
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue(
      impersonationRow({ expiresAt: new Date(Date.now() - 1000) })
    );

    await expect(requireMerchantSession()).rejects.toThrow(/WGC internal accounts cannot access/);
  });

  it("impersonation cookie's adminUserId doesn't match the current admin session (cross-account replay) is rejected", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    // Cookie was minted for admin-1, but the currently logged-in admin is admin-2.
    const sessionToken = createSessionToken({ userId: "admin-2", email: "admin-2@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-2"));

    await expect(requireMerchantSession()).rejects.toThrow(/WGC internal accounts cannot access/);
    expect(prismaMock.adminImpersonationSession.findUnique).not.toHaveBeenCalled();
  });

  it("target church disabled mid-session is rejected and the session row is ended", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_super_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1"));
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue(impersonationRow());
    prismaMock.church.findUnique.mockResolvedValue(activeChurch("church-target", { status: "SUSPENDED" }));
    prismaMock.adminImpersonationSession.updateMany.mockResolvedValue({ count: 1 });

    await expect(requireMerchantSession()).rejects.toThrow(/WGC internal accounts cannot access/);
    expect(prismaMock.adminImpersonationSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ endedReason: "target_disabled" }) })
    );
  });

  it("admin demoted below wgc_super_admin still resolves (role check is start-time only, not a v1 mid-session re-check) — documents current behavior", async () => {
    // Note: the resolver re-checks authVersion/disabledAt on every request,
    // but does not itself re-check wgc_super_admin-vs-wgc_admin — that
    // distinction only gates the START route. A demotion to wgc_admin
    // still passes through here since both roles reach the same branch.
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "admin-1", email: "admin-1@wgcpayments.com", role: "wgc_admin", churchId: null, authVersion: 1 });
    const impToken = signImpersonationCookie({ impersonationSessionId: "imp-session-1", adminUserId: "admin-1", targetChurchId: "church-target" });
    setCookies(sessionToken, impToken);

    prismaMock.user.findUnique.mockResolvedValue(adminUser("admin-1", "wgc_admin"));
    prismaMock.adminImpersonationSession.findUnique.mockResolvedValue(impersonationRow());
    prismaMock.church.findUnique.mockResolvedValue(activeChurch());

    const auth = await requireMerchantSession(true);
    expect(auth.isWgcAdmin).toBe(true);
  });

  it("a normal merchant user session never enters the impersonation branch at all", async () => {
    const { createSessionToken, requireMerchantSession } = await loadModules();
    const sessionToken = createSessionToken({ userId: "owner-1", email: "owner-1@church.org", role: "owner", churchId: "church-a", authVersion: 1 });
    setCookies(sessionToken, undefined);
    prismaMock.user.findUnique.mockResolvedValue({ id: "owner-1", email: "owner-1@church.org", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null });
    prismaMock.wgcSubscription.findUnique.mockResolvedValue(null);
    prismaMock.church.findUnique.mockResolvedValue({ billingSetupStatus: null, status: "ACTIVE" });

    const auth = await requireMerchantSession(true);
    expect(auth.churchId).toBe("church-a");
    expect(auth.isWgcAdmin).toBe(false);
    expect(auth.impersonation).toBeUndefined();
    expect(prismaMock.adminImpersonationSession.findUnique).not.toHaveBeenCalled();
  });
});

// Signs an impersonation cookie using the exact same HMAC scheme
// impersonation.ts uses internally, so tests don't need that module's
// private signing function exported just for testing.
function signImpersonationCookie(payload: { impersonationSessionId: string; adminUserId: string; targetChurchId: string }): string {
  const crypto = require("crypto");
  const full = { ...payload, exp: Math.floor(Date.now() / 1000) + 3600 };
  const payloadB64 = Buffer.from(JSON.stringify(full)).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET).update(payloadB64).digest();
  return `${payloadB64}.${Buffer.from(signature).toString("base64url")}`;
}
