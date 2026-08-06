import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  aplosConnection: { findUnique: vi.fn() },
  aplosSyncRecord: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/admin/merchants/[churchId]/aplos/route");
}
function context(churchId = "church-a") {
  return { params: Promise.resolve({ churchId }) };
}

describe("GET /api/admin/merchants/[churchId]/aplos", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an admin session", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://x"), context());
    expect(res.status).toBe(401);
  });

  it("returns connection and sync history for the requested church", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.aplosConnection.findUnique.mockResolvedValue({ status: "CONNECTED" });
    mockPrisma.aplosSyncRecord.findMany.mockResolvedValue([{ id: "sync-1", status: "SYNCED" }]);

    const res = await GET(new Request("http://x"), context("church-a"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connection.status).toBe("CONNECTED");
    expect(data.records).toHaveLength(1);
    expect(mockPrisma.aplosSyncRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { churchId: "church-a" } }));
  });

  it("returns a null connection (not a 404) for an organization with no Aplos connection", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.aplosConnection.findUnique.mockResolvedValue(null);
    mockPrisma.aplosSyncRecord.findMany.mockResolvedValue([]);

    const res = await GET(new Request("http://x"), context());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.connection).toBeNull();
  });
});
