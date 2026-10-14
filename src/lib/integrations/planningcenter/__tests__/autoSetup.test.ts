/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { config: null as Row | null, funds: [] as Row[], mappings: [] as Row[] };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterSyncConfig: { findUnique: async () => db.config, update: async ({ data }: any) => Object.assign(db.config!, data) },
    fund: { findMany: async () => db.funds.filter((f) => f.isActive) },
    planningCenterFundMapping: { findMany: async () => db.mappings },
  },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn(async () => {}) }));
let platformOn = true;
vi.mock("../config", () => ({ isPlanningCenterSyncEnabled: () => platformOn }));
vi.mock("../service", () => ({ getClientForChurch: async () => ({}) }));

const setup = { ensurePaymentSource: vi.fn(), setDefaultFund: vi.fn(), applySuggestedMappings: vi.fn(), createPlanningCenterFund: vi.fn() };
vi.mock("../givingSetup", () => ({
  ensurePaymentSource: (...a: unknown[]) => setup.ensurePaymentSource(...a),
  setDefaultFund: (...a: unknown[]) => setup.setDefaultFund(...a),
  applySuggestedMappings: (...a: unknown[]) => setup.applySuggestedMappings(...a),
  createPlanningCenterFund: (...a: unknown[]) => setup.createPlanningCenterFund(...a),
}));
const listFundsMock = vi.fn();
vi.mock("../givingApi", () => ({ listFunds: (...a: unknown[]) => listFundsMock(...a), isFundUsable: (f: any) => f.visibility !== "nowhere" }));
const readiness = { value: { ready: true, reasons: [] as string[], notes: [] as string[] } };
vi.mock("../syncConfig", () => ({ computeStoredGivingReadiness: async () => readiness.value }));

import { PlanningCenterSetupError } from "../errors";
import { autoSetupAfterConnect } from "../autoSetup";

const actor = { userId: "u1" };
const NOW = new Date("2026-10-14T12:00:00Z");

beforeEach(() => {
  Object.values(setup).forEach((m) => m.mockReset());
  listFundsMock.mockReset();
  platformOn = true;
  readiness.value = { ready: true, reasons: [], notes: [] };
  db.config = { churchId: "c1", pcoOrganizationId: "org1", pcoPaymentSourceId: null, defaultPcoFundId: null, syncMode: "OFF", enabledAt: null };
  db.funds = [{ id: "f1", isActive: true }, { id: "f2", isActive: true }, { id: "f3", isActive: false }];
  db.mappings = [];
  setup.ensurePaymentSource.mockImplementation(async () => { db.config!.pcoPaymentSourceId = "src1"; return { id: "src1" }; });
  setup.setDefaultFund.mockImplementation(async () => { db.config!.defaultPcoFundId = "pdef"; });
  setup.applySuggestedMappings.mockImplementation(async () => { db.mappings.push({ fundId: "f1" }); return { mapped: 1, skipped: 1 }; });
  setup.createPlanningCenterFund.mockImplementation(async (_c: string, fundId: string) => { db.mappings.push({ fundId }); });
  listFundsMock.mockResolvedValue([{ id: "p9", name: "Other", isDefault: false, visibility: "everywhere" }, { id: "pdef", name: "General Fund", isDefault: true, visibility: "everywhere" }]);
});

describe("autoSetupAfterConnect", () => {
  it("sets up the payment source, default fund and every fund, then turns sending on", async () => {
    const result = await autoSetupAfterConnect("c1", actor, NOW);
    expect(result).toMatchObject({ ran: true, enabled: true, matchedFunds: 1, createdFunds: 1 });
    expect(setup.setDefaultFund).toHaveBeenCalledWith("c1", "pdef", actor); // Planning Center's own default, not just any fund
    expect(setup.createPlanningCenterFund).toHaveBeenCalledTimes(1);
    expect(setup.createPlanningCenterFund).toHaveBeenCalledWith("c1", "f2", actor); // only the unmapped ACTIVE fund (f3 is inactive)
    expect(db.config).toMatchObject({ syncMode: "LIVE", sendTiming: "ON_PAYMENT", unmatchedDonorPolicy: "ATTACH_LATER", autoCommitBatches: false, enabledAt: NOW });
  });

  it("does nothing in Planning Center while the platform switch is off", async () => {
    platformOn = false;
    expect(await autoSetupAfterConnect("c1", actor, NOW)).toMatchObject({ ran: false, enabled: false });
    expect(setup.ensurePaymentSource).not.toHaveBeenCalled();
  });

  it("never touches a church that already finished its setup (their choices are theirs)", async () => {
    db.config!.pcoPaymentSourceId = "mine";
    expect(await autoSetupAfterConnect("c1", actor, NOW)).toMatchObject({ ran: false });
    expect(setup.ensurePaymentSource).not.toHaveBeenCalled();
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("keeps a default fund the church already chose", async () => {
    setup.ensurePaymentSource.mockImplementation(async () => { db.config!.pcoPaymentSourceId = "src1"; db.config!.defaultPcoFundId = "theirs"; });
    await autoSetupAfterConnect("c1", actor, NOW);
    expect(setup.setDefaultFund).not.toHaveBeenCalled();
  });

  it("falls back to the first usable fund when Planning Center has no default, and ignores hidden ('nowhere') funds", async () => {
    listFundsMock.mockResolvedValue([{ id: "gone", isDefault: true, visibility: "nowhere" }, { id: "first", isDefault: false, visibility: "everywhere" }]);
    await autoSetupAfterConnect("c1", actor, NOW);
    expect(setup.setDefaultFund).toHaveBeenCalledWith("c1", "first", actor);
  });

  it("stops at the first real problem, leaves sync OFF, and says why (e.g. the user can't write to Giving)", async () => {
    setup.ensurePaymentSource.mockRejectedValue(new PlanningCenterSetupError("The connected Planning Center user doesn't have permission to manage Giving."));
    const result = await autoSetupAfterConnect("c1", actor, NOW);
    expect(result).toMatchObject({ ran: true, enabled: false });
    expect(result.reason).toMatch(/permission to manage Giving/);
    expect(setup.setDefaultFund).not.toHaveBeenCalled();
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("a fund name that already exists is not a failure; any other error is", async () => {
    setup.createPlanningCenterFund.mockRejectedValue(new PlanningCenterSetupError("A fund named “X” already exists in Planning Center."));
    expect(await autoSetupAfterConnect("c1", actor, NOW)).toMatchObject({ createdFunds: 0 });
    setup.createPlanningCenterFund.mockRejectedValue(new Error("boom"));
    db.config!.pcoPaymentSourceId = null;
    db.mappings = [];
    const result = await autoSetupAfterConnect("c1", actor, NOW);
    expect(result).toMatchObject({ enabled: false });
    expect(result.reason).toBe("boom");
  });

  it("only turns sync on if everything the sync needs is really in place", async () => {
    readiness.value = { ready: false, reasons: ["The connected Planning Center user can't make changes in Giving."], notes: [] };
    const result = await autoSetupAfterConnect("c1", actor, NOW);
    expect(result).toMatchObject({ ran: true, enabled: false, reason: "The connected Planning Center user can't make changes in Giving." });
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("sets the go-live moment to NOW, so gifts from before connecting are never sent", async () => {
    await autoSetupAfterConnect("c1", actor, NOW);
    expect(db.config!.enabledAt).toEqual(NOW);
  });
});
