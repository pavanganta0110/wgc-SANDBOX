import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetAdminSession = vi.fn();
vi.mock("@/lib/auth/session", () => ({ getAdminSession: () => mockGetAdminSession() }));

const mockPrisma = {
  systemIncident: { findMany: vi.fn() },
  systemAlert: { groupBy: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../route");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemIncident.findMany.mockResolvedValue([]);
  mockPrisma.systemAlert.groupBy.mockResolvedValue([]);
});

describe("GET /api/admin/system-health/incidents", () => {
  it("rejects an unauthenticated request", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/incidents"));
    expect(res.status).toBe(401);
  });

  it("orders CRITICAL incidents ahead of ERROR/WARNING/INFO regardless of recency", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const now = new Date();
    mockPrisma.systemIncident.findMany.mockResolvedValue([
      { id: "warn", title: "w", service: "Aplos", severity: "WARNING", status: "OPEN", startedAt: now, lastSeenAt: now, resolvedAt: null, occurrenceCount: 1, affectedMerchantCount: 0, affectedUserCount: 0 },
      { id: "crit", title: "c", service: "Finix", severity: "CRITICAL", status: "OPEN", startedAt: now, lastSeenAt: new Date(now.getTime() - 60_000), resolvedAt: null, occurrenceCount: 5, affectedMerchantCount: 2, affectedUserCount: 0 },
    ]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/incidents"));
    const data = await res.json();
    expect(data.incidents[0].id).toBe("crit");
    expect(data.incidents[1].id).toBe("warn");
  });

  it("surfaces which channels actually delivered a SENT alert as notifiedChannels", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    mockPrisma.systemIncident.findMany.mockResolvedValue([
      { id: "inc_1", title: "x", service: "Finix", severity: "CRITICAL", status: "OPEN", startedAt: new Date(), lastSeenAt: new Date(), resolvedAt: null, occurrenceCount: 1, affectedMerchantCount: 0, affectedUserCount: 0 },
    ]);
    mockPrisma.systemAlert.groupBy.mockResolvedValue([
      { incidentId: "inc_1", channel: "EMAIL" },
      { incidentId: "inc_1", channel: "SMS" },
    ]);
    const { GET } = await loadModule();
    const res = await GET(new Request("http://localhost/api/admin/system-health/incidents"));
    const data = await res.json();
    expect(data.incidents[0].notifiedChannels.sort()).toEqual(["EMAIL", "SMS"]);
  });

  it("applies status/severity/service filters to the query", async () => {
    mockGetAdminSession.mockResolvedValue({ userId: "u1", role: "wgc_admin" });
    const { GET } = await loadModule();
    await GET(new Request("http://localhost/api/admin/system-health/incidents?status=RESOLVED&severity=ERROR&service=Aplos"));
    const whereArg = mockPrisma.systemIncident.findMany.mock.calls[0][0].where;
    expect(whereArg).toMatchObject({ status: "RESOLVED", severity: "ERROR", service: "Aplos" });
  });
});
