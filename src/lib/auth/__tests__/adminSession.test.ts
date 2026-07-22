import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));

const mockPrisma = { user: { findUnique: vi.fn() } };
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  return import("@/lib/auth/session");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCookieStore.get.mockReturnValue(undefined);
});

describe("getAdminSession", () => {
  it("returns null when there is no session cookie", async () => {
    const { getAdminSession } = await loadModule();
    expect(await getAdminSession()).toBeNull();
  });

  it("returns null for a merchant-role session token — merchant users cannot use the admin session path", async () => {
    const { getAdminSession, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "u1", email: "u1@a.com", role: "owner", churchId: "church-a" });
    mockCookieStore.get.mockReturnValue({ value: token });

    expect(await getAdminSession()).toBeNull();
    expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when the admin account has been disabled since the token was issued", async () => {
    const { getAdminSession, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "admin-1", email: "admin-1@wgc.com", role: "wgc_admin", churchId: null });
    mockCookieStore.get.mockReturnValue({ value: token });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin-1@wgc.com",
      name: "Admin One",
      role: "wgc_admin",
      disabledAt: new Date(),
      passwordChangedAt: null,
    });

    expect(await getAdminSession()).toBeNull();
  });

  it("returns null when the password has changed since the token was issued (every other session invalidated)", async () => {
    const { getAdminSession, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "admin-1", email: "admin-1@wgc.com", role: "wgc_admin", churchId: null, passwordChangedAt: null });
    mockCookieStore.get.mockReturnValue({ value: token });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin-1@wgc.com",
      name: "Admin One",
      role: "wgc_admin",
      disabledAt: null,
      passwordChangedAt: new Date(), // DB now has a value; token still carries null
    });

    expect(await getAdminSession()).toBeNull();
  });

  it("accepts a valid, current wgc_admin session", async () => {
    const { getAdminSession, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "admin-1", email: "admin-1@wgc.com", role: "wgc_admin", churchId: null, passwordChangedAt: null });
    mockCookieStore.get.mockReturnValue({ value: token });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin-1@wgc.com",
      name: "Admin One",
      role: "wgc_admin",
      disabledAt: null,
      passwordChangedAt: null,
    });

    const session = await getAdminSession();
    expect(session).toEqual({ userId: "admin-1", email: "admin-1@wgc.com", name: "Admin One", role: "wgc_admin" });
  });

  it("accepts a valid wgc_super_admin session", async () => {
    const { getAdminSession, createSessionToken } = await loadModule();
    const token = createSessionToken({ userId: "admin-1", email: "admin-1@wgc.com", role: "wgc_super_admin", churchId: null, passwordChangedAt: null });
    mockCookieStore.get.mockReturnValue({ value: token });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: "admin-1",
      email: "admin-1@wgc.com",
      name: "Super Admin",
      role: "wgc_super_admin",
      disabledAt: null,
      passwordChangedAt: null,
    });

    const session = await getAdminSession();
    expect(session?.role).toBe("wgc_super_admin");
  });
});
