import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  systemErrorGroup: { findMany: vi.fn() },
  systemHealthEvent: { groupBy: vi.fn(), findMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemErrorGroup.findMany.mockResolvedValue([]);
  mockPrisma.systemHealthEvent.groupBy.mockResolvedValue([]);
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/system-health/errors", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/errors"));
    expect(res.status).toBe(401);
    expect(mockPrisma.systemErrorGroup.findMany).not.toHaveBeenCalled();
  });

  it("returns error groups for an authenticated admin", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemErrorGroup.findMany.mockResolvedValue([
      { id: "g1", service: "Finix", integration: null, route: "/refund", severity: "ERROR", status: "OPEN", message: "boom", firstSeenAt: new Date(), lastSeenAt: new Date(), occurrenceCount: 3, incidentId: null },
    ]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/errors"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.errorGroups).toHaveLength(1);
    expect(data.errorGroups[0].occurrenceCount).toBe(3);
  });

  it("scopes the query to only groups with an event for the given merchant when merchantId is filtered — merchant isolation", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    await GET(new Request("http://localhost/api/admin/system-health/errors?merchantId=church_a"));

    const whereArg = mockPrisma.systemErrorGroup.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ events: { some: { merchantId: "church_a" } } });
  });

  it("never includes another merchant's filter when a different merchantId is requested", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    await GET(new Request("http://localhost/api/admin/system-health/errors?merchantId=church_b"));

    const whereArg = mockPrisma.systemErrorGroup.findMany.mock.calls[0][0].where;
    expect(whereArg.events.some.merchantId).toBe("church_b");
    expect(whereArg.events.some.merchantId).not.toBe("church_a");
  });

  it("applies severity/service/status filters to the query", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    await GET(new Request("http://localhost/api/admin/system-health/errors?severity=CRITICAL&service=Finix&status=OPEN"));

    const whereArg = mockPrisma.systemErrorGroup.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ severity: "CRITICAL", service: "Finix", status: "OPEN" });
  });
});
