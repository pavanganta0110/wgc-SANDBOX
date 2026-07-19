import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    donor: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    donorNote: { create: vi.fn() },
    organizationContact: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock("@/lib/dashboardAudit", () => ({
  logDashboardAction: vi.fn().mockResolvedValue(undefined),
}));

async function loadModule(path: string) {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import(`@/app/api/merchant/${path}/route`);
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

function sessionCookie(createSessionToken: any, role: string, userId: string, churchId = "church-a") {
  return createSessionToken({ userId, email: `${userId}@b.com`, role, churchId, authVersion: 1 });
}

function mockUser(userId: string, role: string, churchId = "church-a") {
  return { id: userId, email: `${userId}@b.com`, churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("CP4C: donor create/import and organization contacts routes migrated off getSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("owner can create a donor scoped to their own church", async () => {
    const mod = await loadModule("donors/create");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.donor.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.donor.create).mockResolvedValue({ id: "donor-1" } as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "Jo Donor" }) }));
    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.donor.create).mock.calls[0][0] as any).data.churchId).toBe("church-a");
  });

  it("viewer cannot create a donor", async () => {
    const mod = await loadModule("donors/create");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "viewer", "viewer-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer-1", "viewer") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "Jo Donor" }) }));
    expect(res.status).toBe(401);
    expect(prisma.donor.create).not.toHaveBeenCalled();
  });

  it("wgc_admin is rejected from donor import commit", async () => {
    const mod = await loadModule("donors/import/commit");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "wgc_admin", "admin-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("admin-1", "wgc_admin") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ csvText: "name,email\nA,a@b.com" }) }));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(prisma.donor.create).not.toHaveBeenCalled();
  });

  it("owner can list organization contacts scoped to their own church", async () => {
    const mod = await loadModule("organization/contacts");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner") as never);
    vi.mocked(prisma.organizationContact.findMany).mockResolvedValue([] as never);

    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect((vi.mocked(prisma.organizationContact.findMany).mock.calls[0][0] as any).where.churchId).toBe("church-a");
  });

  it("fundraiser cannot manage organization contacts", async () => {
    const mod = await loadModule("organization/contacts");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "fundraiser", "fundraiser-1") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("fundraiser-1", "fundraiser") as never);

    const res = await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "Contact", role: "PRIMARY" }) }));
    expect(res.status).toBe(401);
    expect(prisma.organizationContact.create).not.toHaveBeenCalled();
  });

  it("cross-church donor lookup is denied — churchId always comes from auth, never the request", async () => {
    const mod = await loadModule("donors/create");
    const { prisma } = await import("@/lib/prisma");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(mod.createSessionToken, "owner", "owner-1", "church-a") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner-1", "owner", "church-a") as never);
    vi.mocked(prisma.donor.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.donor.create).mockResolvedValue({ id: "donor-1" } as never);

    await mod.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ name: "Jo Donor" }) }));
    const createCall = (vi.mocked(prisma.donor.create).mock.calls[0][0] as any).data;
    expect(createCall.churchId).toBe("church-a");
  });
});
