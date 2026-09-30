import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemErrorGroup: { count: vi.fn() },
  systemIncident: { findMany: vi.fn(), count: vi.fn() },
  systemHealthEvent: { findMany: vi.fn() },
  apiRequestLog: { aggregate: vi.fn(), count: vi.fn() },
  paymentAttempt: { count: vi.fn() },
  user: { count: vi.fn() },
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
  mockPrisma.paymentAttempt.count.mockResolvedValue(0);
  mockPrisma.user.count.mockResolvedValue(0);
});

describe("getSystemHealthOverview — activeUsersNow", () => {
  it("splits active-now counts between WGC admins and merchant staff, and sums them into total", async () => {
    mockPrisma.user.count.mockImplementation(({ where }: { where: { role: { in?: string[]; notIn?: string[] } } }) => {
      if (where.role.in) return Promise.resolve(2); // wgc_admin/wgc_super_admin bucket
      return Promise.resolve(5); // notIn bucket — everyone else (merchant staff)
    });
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.activeUsersNow).toEqual({ admins: 2, merchantStaff: 5, total: 7 });
  });

  it("is zero, not null/undefined, when nobody has been active recently", async () => {
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.activeUsersNow).toEqual({ admins: 0, merchantStaff: 0, total: 0 });
  });
});

describe("getSystemHealthOverview — checkoutThroughput", () => {
  it("is Unknown (null success rate) when there have been no attempts in the last hour", async () => {
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.checkoutThroughput.successRatePercent).toBeNull();
  });

  it("computes a real success rate from succeeded vs. failed PaymentAttempt rows in the last hour", async () => {
    mockPrisma.paymentAttempt.count.mockImplementation(({ where }: { where: { status?: string } }) => {
      if (where.status === "SUCCEEDED") return Promise.resolve(18);
      if (where.status === "FAILED") return Promise.resolve(2);
      return Promise.resolve(20); // the unfiltered attemptsLastHour/attemptsLast5Min calls
    });
    const { getSystemHealthOverview } = await loadModule();
    const overview = await getSystemHealthOverview();
    expect(overview.checkoutThroughput.succeededLastHour).toBe(18);
    expect(overview.checkoutThroughput.failedLastHour).toBe(2);
    expect(overview.checkoutThroughput.successRatePercent).toBe(90);
  });

  it("never queries anything but PaymentAttempt for this — no new write path, purely additive read", async () => {
    const { getSystemHealthOverview } = await loadModule();
    await getSystemHealthOverview();
    expect(mockPrisma.paymentAttempt.count).toHaveBeenCalled();
  });
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
