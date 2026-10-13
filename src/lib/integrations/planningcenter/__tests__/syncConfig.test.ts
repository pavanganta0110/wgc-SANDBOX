/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const findConfig = vi.fn();
const updateConfig = vi.fn(async (a: any) => a);
const deleteMappings = vi.fn(async (a: any) => a);
const findConnection = vi.fn();
const findFunds = vi.fn();
const findMappings = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterSyncConfig: { findUnique: (a: any) => findConfig(a), update: (a: any) => updateConfig(a) },
    planningCenterFundMapping: { deleteMany: (a: any) => deleteMappings(a), findMany: (a: any) => findMappings(a) },
    planningCenterConnection: { findUnique: (a: any) => findConnection(a) },
    fund: { findMany: (a: any) => findFunds(a) },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));

import { computeStoredGivingReadiness, resetGivingSetupIfOrganizationChanged } from "../syncConfig";

beforeEach(() => vi.clearAllMocks());

describe("resetGivingSetupIfOrganizationChanged", () => {
  it("does nothing for a church with no setup yet", async () => {
    findConfig.mockResolvedValue(null);
    await expect(resetGivingSetupIfOrganizationChanged("church1", "127")).resolves.toBe(false);
    expect(updateConfig).not.toHaveBeenCalled();
    expect(deleteMappings).not.toHaveBeenCalled();
  });

  it("keeps everything when reconnecting to the SAME organization", async () => {
    findConfig.mockResolvedValue({ churchId: "church1", pcoOrganizationId: "127" });
    await expect(resetGivingSetupIfOrganizationChanged("church1", "127")).resolves.toBe(false);
    expect(deleteMappings).not.toHaveBeenCalled();
  });

  it("wipes mappings, source and default fund and bumps syncVersion for a DIFFERENT organization", async () => {
    findConfig.mockResolvedValue({ churchId: "church1", pcoOrganizationId: "OLD" });
    await expect(resetGivingSetupIfOrganizationChanged("church1", "NEW")).resolves.toBe(true);
    expect(deleteMappings).toHaveBeenCalledWith({ where: { churchId: "church1" } });
    expect(updateConfig.mock.calls[0][0].data).toEqual({
      pcoOrganizationId: "NEW",
      pcoPaymentSourceId: null,
      pcoPaymentSourceName: null,
      paymentSourceReadyAt: null,
      defaultPcoFundId: null,
      defaultPcoFundName: null,
      syncVersion: { increment: 1 },
    });
  });
});

describe("computeStoredGivingReadiness", () => {
  const fullSetup = () => {
    findConnection.mockResolvedValue({ status: "CONNECTED", pcoOrganizationId: "127", canReadGiving: true, canWriteGiving: true });
    findConfig.mockResolvedValue({ pcoOrganizationId: "127", pcoPaymentSourceId: "s1", defaultPcoFundId: "p1", defaultPcoFundName: "General" });
    findFunds.mockResolvedValue([{ id: "f1", name: "Missions" }]);
    findMappings.mockResolvedValue([{ fundId: "f1" }]);
  };

  it("is ready with a complete setup and uses no network (only the database)", async () => {
    fullSetup();
    expect(await computeStoredGivingReadiness("church1")).toEqual({ ready: true, reasons: [], notes: [] });
  });

  it("is not ready with no connection or no config", async () => {
    findConnection.mockResolvedValue(null);
    findConfig.mockResolvedValue(null);
    findFunds.mockResolvedValue([]);
    findMappings.mockResolvedValue([]);
    const r = await computeStoredGivingReadiness("church1");
    expect(r.ready).toBe(false);
    expect(r.reasons.length).toBeGreaterThan(2);
  });

  it("is not ready when the stored organization no longer matches the connection", async () => {
    fullSetup();
    findConfig.mockResolvedValue({ pcoOrganizationId: "OLD", pcoPaymentSourceId: "s1", defaultPcoFundId: "p1", defaultPcoFundName: "General" });
    expect((await computeStoredGivingReadiness("church1")).reasons.join(" ")).toMatch(/different Planning Center organization/);
  });

  it("is not ready until write access has been confirmed", async () => {
    fullSetup();
    findConnection.mockResolvedValue({ status: "CONNECTED", pcoOrganizationId: "127", canReadGiving: true, canWriteGiving: null });
    expect((await computeStoredGivingReadiness("church1")).ready).toBe(false);
  });

  it("notes unmapped funds but stays ready (they use the default fund)", async () => {
    fullSetup();
    findMappings.mockResolvedValue([]);
    const r = await computeStoredGivingReadiness("church1");
    expect(r.ready).toBe(true);
    expect(r.notes[0]).toMatch(/1 fund isn't mapped/);
  });
});
