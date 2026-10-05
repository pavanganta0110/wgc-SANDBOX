import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuth = vi.fn();
vi.mock("@/lib/auth/requireMerchantSession", () => ({ requireMerchantSession: () => mockAuth() }));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  migrationJob: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

function ownerAuth(churchId = "church-a") {
  return { userId: "u1", email: "owner@a.com", churchId, role: "owner", rawRole: "owner" };
}
function viewerAuth(churchId = "church-a") {
  return { userId: "u2", email: "viewer@a.com", churchId, role: "viewer", rawRole: "viewer" };
}

function req(body?: unknown, method = "POST") {
  return new Request("http://x", { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}

async function loadCollectionRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/migrations/route");
}
async function loadJobRoute() {
  vi.resetModules();
  return import("@/app/api/merchant/migrations/[jobId]/route");
}

describe("POST /api/merchant/migrations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires canManageMigrations", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await POST(req({ sourceSystem: "CSV_GENERIC" }));
    expect(res.status).toBe(403);
  });

  it("creates a job for the implemented CSV_GENERIC source", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    mockPrisma.migrationJob.create.mockResolvedValue({
      id: "job1",
      churchId: "church-a",
      sourceSystem: "CSV_GENERIC",
      status: "DRAFT",
      entityTypesJson: [],
      fileName: null,
      totalRecords: 0,
      processedRecords: 0,
      succeededRecords: 0,
      failedRecords: 0,
      skippedRecords: 0,
      createdAt: new Date(),
      startedAt: null,
      completedAt: null,
    });

    const res = await POST(req({ sourceSystem: "CSV_GENERIC" }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.job.id).toBe("job1");
    expect(mockPrisma.migrationJob.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ churchId: "church-a" }) }));
  });

  it("rejects a source system that isn't implemented yet", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ sourceSystem: "STRIPE" }));
    expect(res.status).toBe(400);
    expect(mockPrisma.migrationJob.create).not.toHaveBeenCalled();
  });

  it("rejects an unrecognized source system", async () => {
    const { POST } = await loadCollectionRoute();
    mockAuth.mockResolvedValue(ownerAuth());
    const res = await POST(req({ sourceSystem: "NOT_A_REAL_SOURCE" }));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/merchant/migrations/[jobId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 for a job belonging to a different church (tenant isolation)", async () => {
    const { GET } = await loadJobRoute();
    mockAuth.mockResolvedValue(ownerAuth("church-a"));
    mockPrisma.migrationJob.findFirst.mockResolvedValue(null); // scoped query for church-a finds nothing

    const res = await GET(req(undefined, "GET"), { params: Promise.resolve({ jobId: "job-owned-by-church-b" }) });
    expect(res.status).toBe(404);
    expect(mockPrisma.migrationJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "job-owned-by-church-b", churchId: "church-a" } }));
  });

  it("requires canManageMigrations", async () => {
    const { GET } = await loadJobRoute();
    mockAuth.mockResolvedValue(viewerAuth());
    const res = await GET(req(undefined, "GET"), { params: Promise.resolve({ jobId: "job1" }) });
    expect(res.status).toBe(403);
  });
});
