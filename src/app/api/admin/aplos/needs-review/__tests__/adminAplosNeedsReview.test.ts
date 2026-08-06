import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  aplosSyncRecord: { findMany: vi.fn() },
  church: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("@/app/api/admin/aplos/needs-review/route");
}

describe("GET /api/admin/aplos/needs-review", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires an admin session", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("queries only NEEDS_REVIEW and FAILED statuses across all churches", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.aplosSyncRecord.findMany.mockResolvedValue([]);
    mockPrisma.church.findMany.mockResolvedValue([]);

    await GET();
    expect(mockPrisma.aplosSyncRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ["NEEDS_REVIEW", "FAILED"] } } })
    );
  });

  it("joins each record with its church's name and slug", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.aplosSyncRecord.findMany.mockResolvedValue([{ id: "sync-1", churchId: "church-a", status: "NEEDS_REVIEW" }]);
    mockPrisma.church.findMany.mockResolvedValue([{ id: "church-a", name: "First Church", slug: "first-church" }]);

    const res = await GET();
    const data = await res.json();
    expect(data.records[0].churchName).toBe("First Church");
    expect(data.records[0].churchSlug).toBe("first-church");
  });

  it("falls back to Unknown for a church id that no longer resolves", async () => {
    const { GET } = await loadModule();
    mockGetAdminSession.mockResolvedValue({ email: "admin@wgc.com", role: "wgc_admin" });
    mockPrisma.aplosSyncRecord.findMany.mockResolvedValue([{ id: "sync-1", churchId: "church-missing", status: "FAILED" }]);
    mockPrisma.church.findMany.mockResolvedValue([]);

    const res = await GET();
    const data = await res.json();
    expect(data.records[0].churchName).toBe("Unknown");
  });
});
