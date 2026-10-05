import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

async function loadModule() {
  vi.resetModules();
  return import("@/lib/auth/requireAdminSession");
}

function session(overrides: Partial<{ role: "wgc_admin" | "wgc_super_admin"; mfaEnabled: boolean; mfaVerified: boolean }> = {}) {
  return {
    userId: "admin-1",
    email: "admin-1@wgcpayments.com",
    name: "Admin",
    role: "wgc_super_admin" as const,
    mfaEnabled: true,
    mfaVerified: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireMfaVerifiedAdminSession", () => {
  it("returns the session when it is a fully MFA-verified admin session", async () => {
    mockGetAdminSession.mockResolvedValue(session());
    const { requireMfaVerifiedAdminSession } = await loadModule();
    const result = await requireMfaVerifiedAdminSession();
    expect(result.userId).toBe("admin-1");
  });

  it("throws UnauthorizedError (401) when there is no session at all", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { requireMfaVerifiedAdminSession } = await loadModule();
    await expect(requireMfaVerifiedAdminSession()).rejects.toMatchObject({ status: 401 });
  });

  it("throws ForbiddenError (403) — not UnauthorizedError — when mfaEnabled is false on the account", async () => {
    mockGetAdminSession.mockResolvedValue(session({ mfaEnabled: false, mfaVerified: false }));
    const { requireMfaVerifiedAdminSession } = await loadModule();
    await expect(requireMfaVerifiedAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it("throws ForbiddenError (403) when mfaEnabled is true (account enrolled) but THIS session's mfaVerified is false", async () => {
    // The core guarantee: account-level enrollment status alone never
    // satisfies this gate — proves the check is session-bound, not
    // User.mfaEnabled-derived.
    mockGetAdminSession.mockResolvedValue(session({ mfaEnabled: true, mfaVerified: false }));
    const { requireMfaVerifiedAdminSession } = await loadModule();
    await expect(requireMfaVerifiedAdminSession()).rejects.toMatchObject({ status: 403 });
  });

  it("accepts both wgc_admin and wgc_super_admin roles when fully MFA-verified", async () => {
    mockGetAdminSession.mockResolvedValue(session({ role: "wgc_admin" }));
    const { requireMfaVerifiedAdminSession } = await loadModule();
    const result = await requireMfaVerifiedAdminSession();
    expect(result.role).toBe("wgc_admin");
  });
});
