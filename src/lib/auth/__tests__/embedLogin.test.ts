import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const mockPrisma = {
  user: { findFirst: vi.fn() },
  embedLoginToken: { create: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

const staff = { id: "user-1", role: "fundraiser", disabledAt: null, mfaEnabled: false };

describe("createEmbedLoginToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockPrisma.user.findFirst.mockResolvedValue(staff);
    mockPrisma.embedLoginToken.create.mockResolvedValue({});
  });

  it("looks the person up inside the key's own church, by lowercased email", async () => {
    const { createEmbedLoginToken } = await import("../embedLogin");

    await createEmbedLoginToken({ churchId: "church-a", email: "  Staff@Church.ORG " });

    expect(mockPrisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "church-a", email: "staff@church.org" } }));
  });

  it("returns a random link and stores only its hash, expiring in about a minute", async () => {
    const { createEmbedLoginToken, EMBED_LOGIN_TTL_SECONDS } = await import("../embedLogin");
    const before = Date.now();

    const result = await createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org", redirectTo: "/merchant/dashboard", apiKeyId: "key-1" });

    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
    const stored = mockPrisma.embedLoginToken.create.mock.calls[0][0].data;
    expect(stored.tokenHash).toBe(sha(result.token));
    expect(JSON.stringify(stored)).not.toContain(result.token);
    expect(stored).toMatchObject({ churchId: "church-a", userId: "user-1", apiKeyId: "key-1", redirectTo: "/merchant/dashboard" });
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + EMBED_LOGIN_TTL_SECONDS * 1000 - 50);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + EMBED_LOGIN_TTL_SECONDS * 1000 + 50);
  });

  it("issues a different link every time", async () => {
    const { createEmbedLoginToken } = await import("../embedLogin");
    const a = await createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" });
    const b = await createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" });
    expect(a.token).not.toBe(b.token);
  });

  it("refuses an unknown person without writing a link", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(null);
    const { createEmbedLoginToken } = await import("../embedLogin");

    await expect(createEmbedLoginToken({ churchId: "church-a", email: "nobody@x.org" })).rejects.toMatchObject({ code: "user_not_found" });
    expect(mockPrisma.embedLoginToken.create).not.toHaveBeenCalled();
  });

  it("refuses a disabled account", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...staff, disabledAt: new Date() });
    const { createEmbedLoginToken } = await import("../embedLogin");
    await expect(createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" })).rejects.toMatchObject({ code: "user_disabled" });
  });

  it("allows fundraiser and viewer, and refuses owner, admin and the legacy church_admin role", async () => {
    const { createEmbedLoginToken } = await import("../embedLogin");

    for (const role of ["fundraiser", "viewer"]) {
      mockPrisma.user.findFirst.mockResolvedValue({ ...staff, role });
      await expect(createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" })).resolves.toBeTruthy();
    }
    for (const role of ["owner", "admin", "church_admin", "wgc_admin", "wgc_super_admin"]) {
      mockPrisma.user.findFirst.mockResolvedValue({ ...staff, role });
      await expect(createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" })).rejects.toMatchObject({ code: "role_not_allowed" });
    }
  });

  it("refuses a person who has MFA turned on, so the code step can't be bypassed", async () => {
    mockPrisma.user.findFirst.mockResolvedValue({ ...staff, mfaEnabled: true });
    const { createEmbedLoginToken } = await import("../embedLogin");
    await expect(createEmbedLoginToken({ churchId: "church-a", email: "staff@church.org" })).rejects.toMatchObject({ code: "mfa_enabled" });
  });
});

describe("consumeEmbedLoginToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("spends a valid link with one conditional update on the hash, unused and unexpired", async () => {
    mockPrisma.embedLoginToken.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.embedLoginToken.findUnique.mockResolvedValue({ userId: "user-1", churchId: "church-a", redirectTo: "/merchant/dashboard", apiKeyId: "key-1" });
    const { consumeEmbedLoginToken } = await import("../embedLogin");

    const result = await consumeEmbedLoginToken("abc123");

    expect(result).toEqual({ userId: "user-1", churchId: "church-a", redirectTo: "/merchant/dashboard", apiKeyId: "key-1" });
    const where = mockPrisma.embedLoginToken.updateMany.mock.calls[0][0].where;
    expect(where.tokenHash).toBe(sha("abc123"));
    expect(where.usedAt).toBeNull();
    expect(where.expiresAt.gt).toBeInstanceOf(Date);
  });

  it("returns null for an unknown, expired or already-used link", async () => {
    mockPrisma.embedLoginToken.updateMany.mockResolvedValue({ count: 0 });
    const { consumeEmbedLoginToken } = await import("../embedLogin");

    expect(await consumeEmbedLoginToken("abc123")).toBeNull();
    expect(mockPrisma.embedLoginToken.findUnique).not.toHaveBeenCalled();
  });

  it("lets only one of two racing requests win", async () => {
    mockPrisma.embedLoginToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.embedLoginToken.findUnique.mockResolvedValue({ userId: "user-1", churchId: "church-a", redirectTo: null, apiKeyId: null });
    const { consumeEmbedLoginToken } = await import("../embedLogin");

    const [first, second] = await Promise.all([consumeEmbedLoginToken("same-token"), consumeEmbedLoginToken("same-token")]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it("rejects empty or oversized input without touching the database", async () => {
    const { consumeEmbedLoginToken } = await import("../embedLogin");

    expect(await consumeEmbedLoginToken("")).toBeNull();
    expect(await consumeEmbedLoginToken("x".repeat(500))).toBeNull();
    expect(mockPrisma.embedLoginToken.updateMany).not.toHaveBeenCalled();
  });
});

describe("buildEmbedSessionCookie", () => {
  it("is HttpOnly, Secure, SameSite=None and Partitioned, and expires after eight hours", async () => {
    const { buildEmbedSessionCookie, EMBED_SESSION_MAX_AGE_SECONDS } = await import("../embedLogin");

    const cookie = buildEmbedSessionCookie("wgc_session", "signed.token");

    expect(cookie.startsWith("wgc_session=signed.token")).toBe(true);
    for (const attribute of ["HttpOnly", "Secure", "SameSite=None", "Partitioned", "Path=/", `Max-Age=${EMBED_SESSION_MAX_AGE_SECONDS}`]) {
      expect(cookie).toContain(attribute);
    }
    expect(EMBED_SESSION_MAX_AGE_SECONDS).toBe(8 * 60 * 60);
  });
});
