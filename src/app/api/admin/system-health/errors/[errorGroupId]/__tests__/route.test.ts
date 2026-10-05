import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  systemErrorGroup: { findUnique: vi.fn() },
  systemHealthEvent: { findMany: vi.fn(), groupBy: vi.fn() },
  church: { findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

function params(errorGroupId: string) {
  return { params: Promise.resolve({ errorGroupId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
  mockPrisma.systemHealthEvent.groupBy.mockResolvedValue([]);
  mockPrisma.church.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/system-health/errors/[errorGroupId]", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("g1"));
    expect(res.status).toBe(401);
    expect(mockPrisma.systemErrorGroup.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 for an error group that doesn't exist", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemErrorGroup.findUnique.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("missing"));
    expect(res.status).toBe(404);
  });

  it("includes the request ID and WGC reference from the most recent occurrence", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemErrorGroup.findUnique.mockResolvedValue({
      id: "g1",
      service: "Finix",
      integration: null,
      route: "/refund",
      severity: "ERROR",
      status: "OPEN",
      message: "boom",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
      sentryIssueUrl: null,
      notes: null,
      incident: null,
    });
    mockPrisma.systemHealthEvent.findMany.mockResolvedValue([
      { id: "e1", createdAt: new Date(), status: "FAILED", severity: "ERROR", merchantId: null, userId: null, requestId: "req_abc123", externalId: null, wgcReference: "WGC-9F3K2A", release: null, message: "boom", metadata: null },
    ]);

    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("g1"));
    const data = await res.json();
    expect(data.recentEvents[0].requestId).toBe("req_abc123");
    expect(data.recentEvents[0].wgcReference).toBe("WGC-9F3K2A");
  });

  it("returns sentryIssueUrl as null when Sentry isn't connected — Sentry-disabled behavior", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemErrorGroup.findUnique.mockResolvedValue({
      id: "g1",
      service: "Finix",
      integration: null,
      route: null,
      severity: "ERROR",
      status: "OPEN",
      message: "boom",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 1,
      sentryIssueUrl: null,
      notes: null,
      incident: null,
    });

    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("g1"));
    const data = await res.json();
    expect(data.sentryIssueUrl).toBeNull();
    // The route must never fabricate a Sentry link when none is set.
    expect(res.status).toBe(200);
  });

  it("resolves affected merchant names from the church table", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemErrorGroup.findUnique.mockResolvedValue({
      id: "g1",
      service: "Aplos",
      integration: null,
      route: null,
      severity: "ERROR",
      status: "OPEN",
      message: "sync failed",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      occurrenceCount: 2,
      sentryIssueUrl: null,
      notes: null,
      incident: null,
    });
    mockPrisma.systemHealthEvent.groupBy.mockImplementation(({ by }: { by: string[] }) =>
      by.includes("merchantId") ? Promise.resolve([{ merchantId: "church_a" }]) : Promise.resolve([])
    );
    mockPrisma.church.findMany.mockResolvedValue([{ id: "church_a", name: "Grace Church" }]);

    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost"), params("g1"));
    const data = await res.json();
    expect(data.affectedMerchants).toEqual([{ id: "church_a", name: "Grace Church" }]);
  });
});
