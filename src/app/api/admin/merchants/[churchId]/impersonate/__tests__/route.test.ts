import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import type { createSessionToken as CreateSessionToken } from "@/lib/auth/session";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));

const prismaMock = {
  user: { findUnique: vi.fn() },
  church: { findUnique: vi.fn() },
  adminImpersonationSession: { create: vi.fn() },
  dashboardAuditLog: { create: vi.fn().mockResolvedValue({}) },
};
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/admin/merchants/[churchId]/impersonate/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

/**
 * mfaVerified mirrors exactly what a real signed session token would
 * carry: `undefined`/omitted for a password-only or pre-MFA-rollout
 * session, `false` never actually issued but tested anyway for
 * completeness, `true` only ever set by completeAdminLogin's post-OTP path
 * or mfa/confirm's post-enrollment reissue.
 */
function adminSessionCookie(
  createSessionToken: typeof CreateSessionToken,
  role: "wgc_admin" | "wgc_super_admin",
  opts: { userId?: string; mfaVerified?: boolean } = {}
) {
  const { userId = "admin-1", mfaVerified } = opts;
  return createSessionToken({ userId, email: `${userId}@wgcpayments.com`, role, churchId: null, authVersion: 1, mfaVerified });
}

function adminUserRow(userId: string, role: "wgc_admin" | "wgc_super_admin", opts: { disabledAt?: Date | null; mfaEnabled?: boolean } = {}) {
  const { disabledAt = null, mfaEnabled = true } = opts;
  return { id: userId, email: `${userId}@wgcpayments.com`, name: "Admin", role, disabledAt, passwordChangedAt: null, mfaEnabled };
}

const params = (churchId: string) => ({ params: Promise.resolve({ churchId }) });

describe("POST /api/admin/merchants/[churchId]/impersonate — MFA-verified session required at the API level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("a successfully MFA-verified super-admin session + active church starts impersonation, sets the cookie, and audit-logs the start", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "ACTIVE" });
    prismaMock.adminImpersonationSession.create.mockResolvedValue({ id: "imp-1" });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectTo).toBe("/merchant/dashboard");
    expect(mockCookieStore.set).toHaveBeenCalledWith(
      "wgc_impersonation",
      expect.any(String),
      expect.objectContaining({ httpOnly: true, sameSite: "lax" })
    );
    expect(prismaMock.dashboardAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "ADMIN_IMPERSONATION_STARTED", churchId: "church-a" }) })
    );
  });

  it("a password-only session (no mfaVerified claim at all) is denied — direct API request cannot bypass the dashboard MFA gate", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", {}) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(prismaMock.adminImpersonationSession.create).not.toHaveBeenCalled();
  });

  it("an enrolled admin whose CURRENT session never completed OTP is denied, even though the account's mfaEnabled is true in the DB", async () => {
    // The exact attack this gate exists for: a stale/stolen pre-enrollment
    // session cookie, captured before MFA existed on this account, replayed
    // after the real admin enables MFA in a DIFFERENT browser. The DB now
    // says mfaEnabled: true, but THIS token was never signed with
    // mfaVerified: true — proves the gate reads the session claim, not the
    // live account flag.
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: false }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(prismaMock.adminImpersonationSession.create).not.toHaveBeenCalled();
  });

  it("an account that has never enabled MFA at all is denied", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: false }));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("an MFA-verified wgc_admin (not super) is forbidden by the role check — no cookie set", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_admin", { mfaEnabled: true }));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(403);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(prismaMock.adminImpersonationSession.create).not.toHaveBeenCalled();
  });

  it("no session at all is unauthorized", async () => {
    const { POST } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(401);
  });

  it("a merchant (non-admin role) session is denied outright — never reaches the MFA check", async () => {
    const { POST, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "merchant-1", email: "merchant@a.com", role: "owner", churchId: "church-a", authVersion: 1 });
    mockCookieStore.get.mockReturnValue({ value: token });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(401);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });

  it("an expired session is denied even if it was originally MFA-verified", async () => {
    const { POST } = await loadModule();
    const payload = {
      userId: "admin-1",
      email: "admin-1@wgcpayments.com",
      role: "wgc_super_admin",
      churchId: null,
      mfaVerified: true,
      exp: Math.floor(Date.now() / 1000) - 60,
    };
    const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.AUTH_SESSION_SECRET!).update(payloadB64).digest();
    const token = `${payloadB64}.${signature.toString("base64url")}`;
    mockCookieStore.get.mockReturnValue({ value: token });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(401);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("a tampered token (mfaVerified flipped to true after signing) fails signature verification and is denied", async () => {
    // Simulates a client trying to forge the mfaVerified claim directly —
    // proves it cannot be supplied/modified by the browser, since flipping
    // even one byte of the payload invalidates the HMAC signature.
    const { POST, createSessionToken } = await loadModule();
    const legitToken = adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: false });
    const [payloadB64, signatureB64] = legitToken.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    payload.mfaVerified = true;
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const forgedToken = `${tamperedPayloadB64}.${signatureB64}`; // old signature, new payload
    mockCookieStore.get.mockReturnValue({ value: forgedToken });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(401);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("nonexistent church returns 404 for an otherwise-valid MFA-verified session", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));
    prismaMock.church.findUnique.mockResolvedValue(null);

    const res = await POST(new Request("http://x", { method: "POST" }), params("no-such-church"));
    expect(res.status).toBe(404);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("disabled/suspended church returns 409, no cookie set", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "SUSPENDED" });

    const res = await POST(new Request("http://x", { method: "POST" }), params("church-a"));
    expect(res.status).toBe(409);
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });

  it("churchId is read only from the URL param — a body-supplied churchId is never consulted", async () => {
    const { POST, createSessionToken } = await loadModule();
    mockCookieStore.get.mockReturnValue({ value: adminSessionCookie(createSessionToken, "wgc_super_admin", { mfaVerified: true }) });
    prismaMock.user.findUnique.mockResolvedValue(adminUserRow("admin-1", "wgc_super_admin", { mfaEnabled: true }));
    prismaMock.church.findUnique.mockResolvedValue({ id: "church-a", name: "Test Church", status: "ACTIVE" });
    prismaMock.adminImpersonationSession.create.mockResolvedValue({ id: "imp-1" });

    await POST(
      new Request("http://x", { method: "POST", body: JSON.stringify({ churchId: "church-EVIL" }) }),
      params("church-a")
    );
    expect(prismaMock.church.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "church-a" } }));
  });
});
