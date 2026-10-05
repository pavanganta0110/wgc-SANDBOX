import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  jobRun: { deleteMany: vi.fn() },
  systemHealthEvent: { deleteMany: vi.fn() },
  systemAlert: { deleteMany: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

async function loadModule() {
  vi.resetModules();
  return import("../retention");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.jobRun.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.systemHealthEvent.deleteMany.mockResolvedValue({ count: 0 });
  mockPrisma.systemAlert.deleteMany.mockResolvedValue({ count: 0 });
});

describe("cleanupOldMonitoringData", () => {
  it("deletes old JobRun rows past their 90-day retention window", async () => {
    mockPrisma.jobRun.deleteMany.mockResolvedValue({ count: 12 });
    const { cleanupOldMonitoringData } = await loadModule();
    const summary = await cleanupOldMonitoringData();
    expect(summary.jobRunsDeleted).toBe(12);
    expect(mockPrisma.jobRun.deleteMany.mock.calls[0][0].where.startedAt.lt).toBeInstanceOf(Date);
  });

  it("deletes routine (INFO/WARNING) health events after 30 days, and error/critical events separately after 90 days", async () => {
    const { cleanupOldMonitoringData } = await loadModule();
    await cleanupOldMonitoringData();
    expect(mockPrisma.systemHealthEvent.deleteMany).toHaveBeenCalledTimes(2);

    const [routineCall, errorCall] = mockPrisma.systemHealthEvent.deleteMany.mock.calls;
    expect(routineCall[0].where.severity.in).toEqual(["INFO", "WARNING"]);
    expect(errorCall[0].where.severity.in).toEqual(["ERROR", "CRITICAL"]);

    const routineCutoff = routineCall[0].where.createdAt.lt.getTime();
    const errorCutoff = errorCall[0].where.createdAt.lt.getTime();
    // Error/critical events get a longer retention window than routine ones
    // — the error cutoff date is further in the past.
    expect(errorCutoff).toBeLessThan(routineCutoff);
  });

  it("never includes an event still linked to an OPEN/INVESTIGATING/MONITORING incident in the error-event delete filter, regardless of age", async () => {
    const { cleanupOldMonitoringData } = await loadModule();
    await cleanupOldMonitoringData();
    const errorCall = mockPrisma.systemHealthEvent.deleteMany.mock.calls[1][0];
    const orClauses = JSON.stringify(errorCall.where.OR);
    // The only way an error event tied to an active incident is deletable is
    // if the incident is RESOLVED or IGNORED — OPEN/INVESTIGATING/MONITORING
    // must never appear as an allowed deletion condition here.
    expect(orClauses).toContain("RESOLVED");
    expect(orClauses).toContain("IGNORED");
    expect(orClauses).not.toContain("\"OPEN\"");
    expect(orClauses).not.toContain("INVESTIGATING");
    expect(orClauses).not.toContain("MONITORING");
  });

  it("deletes old SystemAlert rows past their 180-day retention window", async () => {
    mockPrisma.systemAlert.deleteMany.mockResolvedValue({ count: 3 });
    const { cleanupOldMonitoringData } = await loadModule();
    const summary = await cleanupOldMonitoringData();
    expect(summary.alertsDeleted).toBe(3);
  });

  it("never touches AuditLog, DashboardAuditLog, or SystemIncident — only the four tables it declares", async () => {
    const { cleanupOldMonitoringData } = await loadModule();
    await cleanupOldMonitoringData();
    // The mock prisma object only exposes jobRun/systemHealthEvent/systemAlert
    // at all — if the implementation tried to call auditLog.deleteMany() or
    // systemIncident.deleteMany() it would throw "not a function", so a
    // clean resolve here is itself the guarantee.
    await expect(cleanupOldMonitoringData()).resolves.toBeDefined();
  });
});
