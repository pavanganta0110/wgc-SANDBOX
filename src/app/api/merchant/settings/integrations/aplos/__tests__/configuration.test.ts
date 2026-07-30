import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCookieStore = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => mockCookieStore) }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() }, aplosAccountConfiguration: { findUnique: vi.fn() } } }));
vi.mock("@/lib/integrations/aplos/mappingService", () => ({ listFundMappingStatus: vi.fn() }));
vi.mock("@/lib/integrations/aplos/syncEligibility", () => ({ computeSyncEligibility: vi.fn() }));

process.env.AUTH_SESSION_SECRET = "test-secret-at-least-32-characters-long";

async function loadModule() {
  vi.resetModules();
  const sessionModule = await import("@/lib/auth/session");
  const route = await import("@/app/api/merchant/settings/integrations/aplos/configuration/route");
  return { ...route, createSessionToken: sessionModule.createSessionToken };
}
function sessionCookie(createSessionToken: (p: { userId: string; email: string; role: "owner" | "admin" | "fundraiser" | "viewer"; churchId: string; authVersion: number }) => string, role: "owner" | "admin" | "fundraiser" | "viewer", churchId = "church-a") {
  return createSessionToken({ userId: "user-1", email: "user@b.com", role, churchId, authVersion: 1 });
}
function mockUser(role: string, churchId = "church-a") {
  return { id: "user-1", email: "user@b.com", churchId, role, disabledAt: null, authVersion: 1, permissionsJson: null };
}

describe("GET /api/merchant/settings/integrations/aplos/configuration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires authentication", async () => {
    const { GET } = await loadModule();
    mockCookieStore.get.mockReturnValue(undefined);
    expect((await GET()).status).toBe(401);
  });

  it("is viewable by a viewer (read-only)", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { listFundMappingStatus } = await import("@/lib/integrations/aplos/mappingService");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "viewer") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("viewer") as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    vi.mocked(listFundMappingStatus).mockResolvedValue([]);
    vi.mocked(computeSyncEligibility).mockResolvedValue({ eligible: false, reasons: [] } as never);

    expect((await GET()).status).toBe(200);
  });

  it("computes mappedCount/unmappedCount from the fund mapping list", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { listFundMappingStatus } = await import("@/lib/integrations/aplos/mappingService");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner") as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    vi.mocked(listFundMappingStatus).mockResolvedValue([
      { fundId: "f1", fundName: "General", isActive: true, mapping: { aplosPurposeId: "1", aplosPurposeName: "P", isDefault: false } },
      { fundId: "f2", fundName: "Missions", isActive: true, mapping: null },
    ] as never);
    vi.mocked(computeSyncEligibility).mockResolvedValue({ eligible: false, reasons: ["x"] } as never);

    const res = await GET();
    const body = await res.json();
    expect(body.mappedCount).toBe(1);
    expect(body.unmappedCount).toBe(1);
  });

  it("scopes strictly to the session's churchId", async () => {
    const { GET, createSessionToken } = await loadModule();
    const { prisma } = await import("@/lib/prisma");
    const { listFundMappingStatus } = await import("@/lib/integrations/aplos/mappingService");
    const { computeSyncEligibility } = await import("@/lib/integrations/aplos/syncEligibility");
    mockCookieStore.get.mockReturnValue({ value: sessionCookie(createSessionToken, "owner", "church-xyz") });
    vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser("owner", "church-xyz") as never);
    vi.mocked(prisma.aplosAccountConfiguration.findUnique).mockResolvedValue(null);
    vi.mocked(listFundMappingStatus).mockResolvedValue([]);
    vi.mocked(computeSyncEligibility).mockResolvedValue({ eligible: false, reasons: [] } as never);

    await GET();
    expect(vi.mocked(listFundMappingStatus).mock.calls[0][0]).toBe("church-xyz");
    expect(vi.mocked(computeSyncEligibility).mock.calls[0][0]).toBe("church-xyz");
  });
});
