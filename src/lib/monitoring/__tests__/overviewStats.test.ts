import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemErrorGroup: { count: vi.fn() },
  systemIncident: { findMany: vi.fn(), count: vi.fn() },
  systemHealthEvent: { findMany: vi.fn() },
  apiRequestLog: { aggregate: vi.fn(), count: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockGetAllServiceStatuses = vi.fn();
vi.mock("../serviceStatus", () => ({ getAllServiceStatuses: () => mockGetAllServiceStatuses() }));

async function loadModule() {
  vi.resetModules();
  return import("../overviewStats");
}

const OPERATIONAL_SERVICES = [
  { service: "WGC API", status: "OPERATIONAL", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, note: "" },
  { service: "Background Jobs", status: "OPERATIONAL", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, note: "" },
  { service: "Webhooks", status: "OPERATIONAL", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, note: "" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAllServiceStatuses.mockResolvedValue(OPERATIONAL_SERVICES);
  mockPrisma.systemErrorGroup.count.mockResolvedValue(0);
  mockPrisma.systemIncident.findMany.mockResolvedValue([]);
  mockPrisma.systemIncident.count.mockResolvedValue(0);
  mockPrisma.systemHealthEvent.findMany.mockResolvedValue([]);
  mockPrisma.apiRequestLog.aggregate.mockResolvedValue({ _count: { _all: 0 }, _avg: { durationMs: null } });
  mockPrisma.apiRequestLog.count.mockResolvedValue(0);
});

describe("getSystemHealthOverview", () => {
  it("failedJobs reuses the Background Jobs service card's own count — never a second, independently-computed number", async () => {
    mockGetAllServiceStatuses.mockResolvedValue([...OPERATIONAL_SERVICES.filter((s) => s.service !== "Background Jobs"), { service: "Background Jobs", status: "DEGRADED", recentFailureCount: 2, lastFailureAt: null, lastSuccessAt: null, note: "" }]);
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.failedJobs).toBe(2);
  });

  it("failedJobs is null (Unknown), not zero, when Background Jobs has no run history yet", async () => {
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    // Background Jobs is OPERATIONAL in the default fixture above, so this
    // asserts the UNKNOWN case specifically:
    mockGetAllServiceStatuses.mockResolvedValue([...OPERATIONAL_SERVICES.filter((s) => s.service !== "Background Jobs"), { service: "Background Jobs", status: "UNKNOWN", recentFailureCount: 0, lastFailureAt: null, lastSuccessAt: null, note: "" }]);
    const overview2 = await getSystemHealthOverview();
    expect(overview2.failedJobs).toBeNull();
    expect(overview.failedJobs).toBe(0);
  });

  it("activeIncidents count and the activeIssues list length always agree — never double-counted across the two", async () => {
    const now = new Date();
    mockPrisma.systemIncident.findMany.mockResolvedValue([
      { id: "i1", title: "a", service: "Finix", severity: "CRITICAL", status: "OPEN", startedAt: now, lastSeenAt: now, occurrenceCount: 1, affectedMerchantCount: 1 },
      { id: "i2", title: "b", service: "Aplos", severity: "WARNING", status: "MONITORING", startedAt: now, lastSeenAt: now, occurrenceCount: 1, affectedMerchantCount: 0 },
    ]);
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.activeIncidents).toBe(2);
    expect(overview.activeIssues).toHaveLength(2);
  });

  it("orders activeIssues by severity (CRITICAL first) regardless of recency", async () => {
    const now = new Date();
    mockPrisma.systemIncident.findMany.mockResolvedValue([
      { id: "warn", title: "w", service: "Aplos", severity: "WARNING", status: "OPEN", startedAt: now, lastSeenAt: now, occurrenceCount: 1, affectedMerchantCount: 0 },
      { id: "crit", title: "c", service: "Finix", severity: "CRITICAL", status: "OPEN", startedAt: now, lastSeenAt: new Date(now.getTime() - 60_000), occurrenceCount: 1, affectedMerchantCount: 1 },
    ]);
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.activeIssues[0].id).toBe("crit");
  });

  it("overall status is MAJOR_ISSUE when any open incident is CRITICAL, even if every service card looks OPERATIONAL", async () => {
    mockPrisma.systemIncident.count.mockResolvedValue(1); // criticalIncidentCount
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.overallStatus).toBe("MAJOR_ISSUE");
  });
});
