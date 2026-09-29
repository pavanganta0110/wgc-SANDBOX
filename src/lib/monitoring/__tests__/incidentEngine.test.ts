import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = {
  systemIncident: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  systemHealthEvent: { groupBy: vi.fn() },
};
vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const mockNotifyIncidentChange = vi.fn();
vi.mock("../alertEngine", () => ({ notifyIncidentChange: mockNotifyIncidentChange }));

// serviceStatus.ts is only ever reached via incidentEngine's own dynamic
// import() — mocked so evaluateErrorGroupIncident/evaluateAllServiceIncidents
// tests exercise incidentEngine's own logic, not serviceStatus's real thresholds.
const mockGetServiceStatusFn = vi.fn();
const mockGetAllServiceStatuses = vi.fn();
vi.mock("../serviceStatus", () => ({ getServiceStatusFn: mockGetServiceStatusFn, getAllServiceStatuses: mockGetAllServiceStatuses }));

async function loadModule() {
  vi.resetModules();
  return import("../incidentEngine");
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.systemHealthEvent.groupBy.mockResolvedValue([]);
});

describe("upsertIncident", () => {
  it("creates a new OPEN incident and sends an INITIAL notification when none exists yet", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
    mockPrisma.systemIncident.create.mockResolvedValue({ id: "inc_1" });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "Finix Degraded", service: "Finix", severity: "ERROR", occurrenceCount: 3, affectedMerchantCount: 1 });
    expect(mockPrisma.systemIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "OPEN", fingerprint: "Finix:degraded" }) }));
    expect(mockNotifyIncidentChange).toHaveBeenCalledWith("inc_1", "INITIAL");
  });

  it("20 concurrent failures against an already-OPEN incident update the same row via an atomic increment, not 20 separate rows", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "OPEN", severity: "ERROR", affectedMerchantCount: 1, affectedUserCount: 0 });
    const { upsertIncident } = await loadModule();
    await Promise.all(
      Array.from({ length: 20 }, () => upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 }))
    );
    expect(mockPrisma.systemIncident.create).not.toHaveBeenCalled();
    expect(mockPrisma.systemIncident.update).toHaveBeenCalledTimes(20);
    // occurrenceCount is incremented via Prisma's own {increment: n} operator per call, never read-modify-written in JS —
    // exactly what makes this safe under concurrency.
    for (const call of mockPrisma.systemIncident.update.mock.calls) {
      expect(call[0].data.occurrenceCount).toEqual({ increment: 1 });
    }
  });

  it("escalates severity in place and notifies ESCALATION when a higher severity arrives for an already-open incident", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "OPEN", severity: "ERROR", affectedMerchantCount: 1, affectedUserCount: 0 });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "CRITICAL", occurrenceCount: 1, affectedMerchantCount: 1 });
    expect(mockPrisma.systemIncident.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ severity: "CRITICAL" }) }));
    expect(mockNotifyIncidentChange).toHaveBeenCalledWith("inc_1", "ESCALATION");
  });

  it("never downgrades severity or notifies when a lower/equal severity arrives", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "OPEN", severity: "CRITICAL", affectedMerchantCount: 1, affectedUserCount: 0 });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 });
    expect(mockPrisma.systemIncident.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ severity: "CRITICAL" }) }));
    expect(mockNotifyIncidentChange).not.toHaveBeenCalled();
  });

  it("never auto-reopens an IGNORED incident", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "IGNORED" });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "CRITICAL", occurrenceCount: 1, affectedMerchantCount: 1 });
    expect(mockPrisma.systemIncident.update).not.toHaveBeenCalled();
    expect(mockPrisma.systemIncident.updateMany).not.toHaveBeenCalled();
    expect(mockNotifyIncidentChange).not.toHaveBeenCalled();
  });

  it("reopens a RESOLVED incident within the reopen window, preserving its history (increments, doesn't reset, occurrenceCount)", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({
      id: "inc_1",
      status: "RESOLVED",
      resolvedAt: new Date(Date.now() - 2 * 60 * 1000), // 2 minutes ago — well within the 30-minute window
      occurrenceCount: 5,
      affectedMerchantCount: 1,
    });
    mockPrisma.systemIncident.updateMany.mockResolvedValue({ count: 1 });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 });
    const call = mockPrisma.systemIncident.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({ id: "inc_1", status: "RESOLVED" });
    expect(call.data.status).toBe("OPEN");
    expect(call.data.occurrenceCount).toEqual({ increment: 1 });
    expect(call.data.startedAt).toBeUndefined(); // preserved, not reset
    expect(mockNotifyIncidentChange).toHaveBeenCalledWith("inc_1", "INITIAL");
  });

  it("reopens a RESOLVED incident past the reopen window as a fresh occurrence (resets startedAt/occurrenceCount)", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({
      id: "inc_1",
      status: "RESOLVED",
      resolvedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago — well past the 30-minute window
      occurrenceCount: 5,
      affectedMerchantCount: 1,
    });
    mockPrisma.systemIncident.updateMany.mockResolvedValue({ count: 1 });
    const { upsertIncident } = await loadModule();
    await upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 });
    const call = mockPrisma.systemIncident.updateMany.mock.calls[0][0];
    expect(call.data.occurrenceCount).toBe(1); // reset, not incremented
    expect(call.data.startedAt).toBeInstanceOf(Date);
    expect(mockNotifyIncidentChange).toHaveBeenCalledWith("inc_1", "INITIAL");
  });

  it("treats a lost reopen race (another evaluator already reopened it) as a harmless no-op", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "RESOLVED", resolvedAt: new Date(), occurrenceCount: 1, affectedMerchantCount: 1 });
    mockPrisma.systemIncident.updateMany.mockResolvedValue({ count: 0 }); // someone else already flipped it out of RESOLVED
    const { upsertIncident } = await loadModule();
    await expect(upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 })).resolves.toBeUndefined();
    expect(mockNotifyIncidentChange).not.toHaveBeenCalled();
  });

  it("never throws even when the database call itself fails", async () => {
    mockPrisma.systemIncident.findUnique.mockRejectedValue(new Error("db down"));
    const { upsertIncident } = await loadModule();
    await expect(upsertIncident({ fingerprint: "Finix:degraded", title: "x", service: "Finix", severity: "ERROR", occurrenceCount: 1, affectedMerchantCount: 1 })).resolves.toBeUndefined();
  });
});

describe("maybeResolveIncident", () => {
  it("does nothing when the service isn't currently healthy", async () => {
    const { maybeResolveIncident } = await loadModule();
    await maybeResolveIncident("Finix:degraded", false);
    expect(mockPrisma.systemIncident.findUnique).not.toHaveBeenCalled();
  });

  it("does not resolve an open incident before the recovery stability window has elapsed", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "OPEN", lastSeenAt: new Date() });
    const { maybeResolveIncident } = await loadModule();
    await maybeResolveIncident("Finix:degraded", true);
    expect(mockPrisma.systemIncident.updateMany).not.toHaveBeenCalled();
  });

  it("resolves an open incident once it has been healthy for the full stability window, and sends a RECOVERY notification", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue({ id: "inc_1", status: "OPEN", lastSeenAt: new Date(Date.now() - 20 * 60 * 1000) });
    mockPrisma.systemIncident.updateMany.mockResolvedValue({ count: 1 });
    const { maybeResolveIncident } = await loadModule();
    await maybeResolveIncident("Finix:degraded", true);
    expect(mockPrisma.systemIncident.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED" }) }));
    expect(mockNotifyIncidentChange).toHaveBeenCalledWith("inc_1", "RECOVERY");
  });

  it("does nothing for an incident that's already RESOLVED or doesn't exist", async () => {
    mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
    const { maybeResolveIncident } = await loadModule();
    await maybeResolveIncident("Finix:degraded", true);
    expect(mockPrisma.systemIncident.updateMany).not.toHaveBeenCalled();
  });

  it("never throws even when the database call itself fails", async () => {
    mockPrisma.systemIncident.findUnique.mockRejectedValue(new Error("db down"));
    const { maybeResolveIncident } = await loadModule();
    await expect(maybeResolveIncident("Finix:degraded", true)).resolves.toBeUndefined();
  });
});

describe("evaluateErrorGroupIncident", () => {
  it("creates/updates an incident when the service is DEGRADED or OUTAGE", async () => {
    mockGetServiceStatusFn.mockReturnValue(vi.fn().mockResolvedValue({ status: "OUTAGE", recentFailureCount: 12, note: "critical spike" }));
    mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
    mockPrisma.systemIncident.create.mockResolvedValue({ id: "inc_1" });
    const { evaluateErrorGroupIncident } = await loadModule();
    await evaluateErrorGroupIncident("Finix");
    expect(mockPrisma.systemIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fingerprint: "Finix:degraded", severity: "CRITICAL" }) }));
  });

  it("does nothing when the service is OPERATIONAL or UNKNOWN", async () => {
    mockGetServiceStatusFn.mockReturnValue(vi.fn().mockResolvedValue({ status: "OPERATIONAL", recentFailureCount: 0, note: "" }));
    const { evaluateErrorGroupIncident } = await loadModule();
    await evaluateErrorGroupIncident("Finix");
    expect(mockPrisma.systemIncident.findUnique).not.toHaveBeenCalled();
  });

  it("two unrelated services each get their own incident, never merged into one", async () => {
    mockGetServiceStatusFn.mockImplementation((service: string) => vi.fn().mockResolvedValue({ status: "OUTAGE", recentFailureCount: 5, note: service }));
    mockPrisma.systemIncident.findUnique.mockResolvedValue(null);
    mockPrisma.systemIncident.create.mockImplementation(({ data }: { data: { fingerprint: string } }) => Promise.resolve({ id: data.fingerprint }));
    const { evaluateErrorGroupIncident } = await loadModule();
    await evaluateErrorGroupIncident("Finix");
    await evaluateErrorGroupIncident("Resend");
    const fingerprints = mockPrisma.systemIncident.create.mock.calls.map((c) => c[0].data.fingerprint);
    expect(fingerprints).toEqual(["Finix:degraded", "Resend:degraded"]);
  });

  it("never throws when the underlying status function is missing", async () => {
    mockGetServiceStatusFn.mockReturnValue(undefined);
    const { evaluateErrorGroupIncident } = await loadModule();
    await expect(evaluateErrorGroupIncident("NotAService")).resolves.toBeUndefined();
  });
});

describe("evaluateAllServiceIncidents", () => {
  it("upserts an incident for every unhealthy service and resolves every operational one with a prior incident", async () => {
    mockGetAllServiceStatuses.mockResolvedValue([
      { service: "Finix", status: "OUTAGE", recentFailureCount: 10, note: "" },
      { service: "Resend", status: "OPERATIONAL", recentFailureCount: 0, note: "" },
    ]);
    mockPrisma.systemIncident.findUnique.mockImplementation(({ where }: { where: { fingerprint: string } }) =>
      where.fingerprint === "Finix:degraded" ? Promise.resolve(null) : Promise.resolve({ id: "inc_resend", status: "OPEN", lastSeenAt: new Date(Date.now() - 20 * 60 * 1000) })
    );
    mockPrisma.systemIncident.create.mockResolvedValue({ id: "inc_finix" });
    mockPrisma.systemIncident.updateMany.mockResolvedValue({ count: 1 });

    const { evaluateAllServiceIncidents } = await loadModule();
    await evaluateAllServiceIncidents();

    expect(mockPrisma.systemIncident.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fingerprint: "Finix:degraded" }) }));
    expect(mockPrisma.systemIncident.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "RESOLVED" }) }));
  });
});
