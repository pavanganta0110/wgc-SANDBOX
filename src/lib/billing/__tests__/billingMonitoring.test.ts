import { describe, it, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.resetModules();
});

function makeEmptyPrismaMock(overrides: Record<string, any> = {}) {
  return {
    wgcSubscription: { findMany: vi.fn().mockResolvedValue([]) },
    billingCharge: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    wgcBillingAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
    finixWebhookEvent: { findMany: vi.fn().mockResolvedValue([]) },
    wgcBillingAccount: { findMany: vi.fn().mockResolvedValue([]) },
    promotionEntitlement: { findMany: vi.fn().mockResolvedValue([]) },
    church: { findMany: vi.fn().mockResolvedValue([]) },
    ...overrides,
  };
}

async function loadModule(prismaMock: any) {
  vi.doMock("@/lib/prisma", () => ({ prisma: prismaMock }));
  return import("@/lib/billing/billingMonitoring");
}

describe("getBillingMonitoringSnapshot — empty data", () => {
  it("returns every section as an empty array when there is no data", async () => {
    const prismaMock = makeEmptyPrismaMock();
    const mod = await loadModule(prismaMock);

    const snapshot = await mod.getBillingMonitoringSnapshot();

    expect(snapshot.trialsMissingFinixDates).toEqual([]);
    expect(snapshot.failedCharges).toEqual([]);
    expect(snapshot.retryGroups).toEqual([]);
    expect(snapshot.routingMismatches).toEqual([]);
    expect(snapshot.unprocessedWebhooks).toEqual([]);
    expect(snapshot.stalePastDue).toEqual([]);
    expect(snapshot.missingBillingInstruments).toEqual([]);
    expect(snapshot.duplicateReferences).toEqual([]);
    expect(snapshot.promotionsEndingSoon).toEqual([]);
    expect(snapshot.orgsWaitingForBillingSetup).toEqual([]);
  });
});

describe("getBillingMonitoringSnapshot — reads flags from WgcBillingAuditLog", () => {
  it("surfaces MERCHANT_ROUTING_MISMATCH entries as routing mismatches and excludes other flag types", async () => {
    const logs = [
      {
        id: "log-1",
        organizationId: "church-A",
        entityId: "sub-1",
        internalReason: "Merchant mismatch detail",
        metadata: { flagType: "MERCHANT_ROUTING_MISMATCH" },
        createdAt: new Date("2027-01-01"),
      },
      {
        id: "log-2",
        organizationId: "church-B",
        entityId: null,
        internalReason: "Duplicate reference detail",
        metadata: { flagType: "DUPLICATE_SUBSCRIPTION_REFERENCE" },
        createdAt: new Date("2027-01-02"),
      },
    ];
    const prismaMock = makeEmptyPrismaMock({
      wgcBillingAuditLog: { findMany: vi.fn().mockResolvedValue(logs) },
      church: { findMany: vi.fn().mockResolvedValue([{ id: "church-A", name: "Church A" }, { id: "church-B", name: "Church B" }]) },
    });
    const mod = await loadModule(prismaMock);

    const snapshot = await mod.getBillingMonitoringSnapshot();

    expect(snapshot.routingMismatches).toHaveLength(1);
    expect(snapshot.routingMismatches[0]).toMatchObject({ organizationId: "church-A", organizationName: "Church A", detail: "Merchant mismatch detail" });

    expect(snapshot.duplicateReferences).toHaveLength(1);
    expect(snapshot.duplicateReferences[0]).toMatchObject({ organizationId: "church-B", organizationName: "Church B", detail: "Duplicate reference detail" });
  });

  it("ignores reconciliation.completed-shaped rows without a recognized flagType", async () => {
    const logs = [
      { id: "log-1", organizationId: "church-A", entityId: null, internalReason: null, metadata: { flagCount: 3 }, createdAt: new Date() },
    ];
    const prismaMock = makeEmptyPrismaMock({
      wgcBillingAuditLog: { findMany: vi.fn().mockResolvedValue(logs) },
    });
    const mod = await loadModule(prismaMock);

    const snapshot = await mod.getBillingMonitoringSnapshot();

    expect(snapshot.routingMismatches).toEqual([]);
    expect(snapshot.duplicateReferences).toEqual([]);
  });
});

describe("getBillingMonitoringSnapshot — other signals", () => {
  it("only groups failed charges into retryGroups when a period has more than one failure", async () => {
    const groups = [
      { organizationId: "church-A", billingPeriod: "2027-01", _count: { _all: 2 } },
      { organizationId: "church-B", billingPeriod: "2027-01", _count: { _all: 1 } },
    ];
    const prismaMock = makeEmptyPrismaMock({
      billingCharge: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue(groups) },
    });
    const mod = await loadModule(prismaMock);

    const snapshot = await mod.getBillingMonitoringSnapshot();

    expect(snapshot.retryGroups).toHaveLength(1);
    expect(snapshot.retryGroups[0]).toMatchObject({ organizationId: "church-A", failedCount: 2 });
  });

  it("flags organizations with a subscription but no WgcBillingAccount row as missing billing instruments", async () => {
    const prismaMock = makeEmptyPrismaMock({
      wgcSubscription: { findMany: vi.fn().mockResolvedValue([{ organizationId: "church-A" }]) },
      wgcBillingAccount: { findMany: vi.fn().mockResolvedValue([]) },
      church: { findMany: vi.fn().mockResolvedValue([{ id: "church-A", name: "Church A" }]) },
    });
    const mod = await loadModule(prismaMock);

    const snapshot = await mod.getBillingMonitoringSnapshot();

    expect(snapshot.missingBillingInstruments).toContainEqual(
      expect.objectContaining({ organizationId: "church-A", reason: "NO_BILLING_ACCOUNT" }),
    );
  });
});
