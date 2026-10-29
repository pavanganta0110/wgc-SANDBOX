import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    church: { findUnique: vi.fn().mockResolvedValue({ billingSetupStatus: null, status: "ACTIVE", name: "Grace Church" }) },
    wgcSubscription: { findUnique: vi.fn().mockResolvedValue(null) },
    user: { findUnique: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendWgcEmail: vi.fn().mockResolvedValue({}) }));

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/team/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}

async function arrange() {
  const mod = await loadModule();
  const { prisma } = await import("@/lib/prisma");
  mockCookieStore.get.mockReturnValue({
    value: mod.createSessionToken({ userId: "owner-1", email: "owner@b.com", role: "owner", churchId: "church-a", authVersion: 1 }),
  });
  vi.mocked(prisma.user.findUnique).mockImplementation((async ({ where }: { where: { id?: string } }) => {
    if (where.id === "owner-1") return { id: "owner-1", email: "owner@b.com", churchId: "church-a", role: "owner", disabledAt: null, authVersion: 1, permissionsJson: null } as never;
    return null as never; // no existing user with the invited email
  }) as never);
  vi.mocked(prisma.user.create).mockImplementation((async ({ data }: { data: { email: string; role: string; setPasswordTokenExpiresAt?: Date; permissionsJson?: unknown } }) => ({
    id: "new-1",
    email: data.email,
    role: data.role,
    passwordHash: null,
    setPasswordTokenExpiresAt: data.setPasswordTokenExpiresAt,
    lastLoginAt: null,
    disabledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    permissionsJson: data.permissionsJson ?? null,
  })) as never);
  return { ...mod, prisma };
}

function invite(body: unknown) {
  return new Request("http://x/api/merchant/settings/team", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/merchant/settings/team — door check-in preset", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("creates a viewer with exactly the two event permissions when the check-in preset is used", async () => {
    const { POST, prisma } = await arrange();

    const res = await POST(invite({ email: "door@b.com", preset: "checkin" }));

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "door@b.com",
          role: "viewer",
          churchId: "church-a",
          permissionsJson: { canViewOwnTransactions: false, canViewEvents: true, canManageEventAttendees: true },
        }),
      })
    );
    const body = await res.json();
    expect(body.member.role).toBe("viewer");
    expect(body.member.permissionOverrides).toEqual({ canViewOwnTransactions: false, canViewEvents: true, canManageEventAttendees: true });
  });

  it("ignores a conflicting role when the preset is set, so a preset can never widen into admin", async () => {
    const { POST, prisma } = await arrange();

    const res = await POST(invite({ email: "door@b.com", role: "admin", preset: "checkin" }));

    expect(res.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: "viewer" }) }));
  });

  it("does not store any permission overrides for an ordinary invite", async () => {
    const { POST, prisma } = await arrange();

    const res = await POST(invite({ email: "staff@b.com", role: "fundraiser" }));

    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data.role).toBe("fundraiser");
    expect(data).not.toHaveProperty("permissionsJson");
  });

  it("treats an unknown preset as no preset", async () => {
    const { POST, prisma } = await arrange();

    const res = await POST(invite({ email: "staff@b.com", role: "viewer", preset: "owner" }));

    expect(res.status).toBe(201);
    const data = vi.mocked(prisma.user.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty("permissionsJson");
  });
});
