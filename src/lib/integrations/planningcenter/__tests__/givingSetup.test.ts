/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of a few Prisma tables */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = {
  connection: null as Row | null,
  config: null as Row | null,
  funds: [] as Row[],
  mappings: [] as Row[],
};

const mapKey = (w: any) => w.churchId_fundId ?? w;

vi.mock("@/lib/prisma", () => {
  const prisma: any = {
    planningCenterConnection: {
      findUnique: async () => (db.connection ? { ...db.connection } : null),
      updateMany: async ({ data }: any) => {
        if (db.connection) Object.assign(db.connection, data);
        return { count: db.connection ? 1 : 0 };
      },
    },
    planningCenterSyncConfig: {
      findUnique: async () => (db.config ? { ...db.config } : null),
      create: async ({ data }: any) => (db.config = { id: "cfg1", syncVersion: 1, ...data }),
      update: async ({ data }: any) => Object.assign(db.config!, data),
    },
    fund: {
      findMany: async ({ where }: any) => db.funds.filter((f) => f.churchId === where.churchId && (where.isActive === undefined || f.isActive === where.isActive)),
      findFirst: async ({ where }: any) => db.funds.find((f) => f.id === where.id && f.churchId === where.churchId) ?? null,
    },
    planningCenterFundMapping: {
      findMany: async () => db.mappings.map((m) => ({ ...m })),
      findUnique: async ({ where }: any) => {
        const k = mapKey(where);
        return db.mappings.find((m) => m.churchId === k.churchId && m.fundId === k.fundId) ?? null;
      },
      deleteMany: async ({ where }: any) => {
        db.mappings = db.mappings.filter((m) => !(m.churchId === where.churchId && (where.fundId === undefined || m.fundId === where.fundId)));
        return { count: 1 };
      },
      upsert: async ({ where, create, update }: any) => {
        const k = mapKey(where);
        const existing = db.mappings.find((m) => m.churchId === k.churchId && m.fundId === k.fundId);
        if (existing) return Object.assign(existing, update);
        const row = { ...create };
        db.mappings.push(row);
        return row;
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma };
});
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn(async () => {}) }));

const listFundsMock = vi.fn();
const listSourcesMock = vi.fn();
const createFundMock = vi.fn();
const createSourceMock = vi.fn();
const touchSourceMock = vi.fn();
vi.mock("../givingApi", async () => {
  const actual = await vi.importActual<typeof import("../givingApi")>("../givingApi");
  return {
    ...actual,
    listFunds: (...a: unknown[]) => listFundsMock(...a),
    listPaymentSources: (...a: unknown[]) => listSourcesMock(...a),
    createFund: (...a: unknown[]) => createFundMock(...a),
    createPaymentSource: (...a: unknown[]) => createSourceMock(...a),
    touchPaymentSource: (...a: unknown[]) => touchSourceMock(...a),
  };
});
vi.mock("../service", () => ({ getClientForChurch: vi.fn(async () => ({})) }));

import { PlanningCenterApiError, PlanningCenterConnectionError, PlanningCenterSetupError } from "../errors";
import {
  applySuggestedMappings,
  createPlanningCenterFund,
  ensurePaymentSource,
  getGivingSetupState,
  saveFundMapping,
  setDefaultFund,
} from "../givingSetup";

const actor = { userId: "u1" };
const apiError = (status: number, category: any = status === 403 ? "ACCESS_DENIED" : "VALIDATION_ERROR") =>
  new PlanningCenterApiError({ category, retryable: false, safeMessage: "x" }, status);
const pcoFund = (id: string, name: string, extra: Row = {}) => ({ id, name, isDefault: false, visibility: "everywhere", ledgerCode: null, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  [listFundsMock, listSourcesMock, createFundMock, createSourceMock, touchSourceMock].forEach((m) => m.mockReset());
  db.connection = { id: "c1", churchId: "church1", status: "CONNECTED", pcoOrganizationId: "127", pcoOrganizationName: "Test Church", canReadGiving: true, canWriteGiving: null };
  db.config = null;
  db.funds = [
    { id: "f1", churchId: "church1", name: "General", description: null, isActive: true, displayOrder: 0 },
    { id: "f2", churchId: "church1", name: "Missions", description: "Mission trips", isActive: true, displayOrder: 1 },
    { id: "f3", churchId: "church1", name: "Retired", description: null, isActive: false, displayOrder: 2 },
    { id: "other", churchId: "church2", name: "Other church fund", description: null, isActive: true, displayOrder: 0 },
  ];
  db.mappings = [];
  listFundsMock.mockResolvedValue([pcoFund("p1", "General Fund", { isDefault: true }), pcoFund("p2", "missions"), pcoFund("p3", "Closed", { visibility: "nowhere" })]);
  listSourcesMock.mockResolvedValue([]);
});

describe("getGivingSetupState", () => {
  it("lists only this church's active funds, with exact-name suggestions for unmapped ones", async () => {
    const state = await getGivingSetupState("church1");
    expect(state.funds.map((f) => f.name)).toEqual(["General", "Missions"]);
    expect(state.funds.find((f) => f.name === "Missions")!.suggestion).toEqual({ pcoFundId: "p2", pcoFundName: "missions" });
    expect(state.funds.find((f) => f.name === "General")!.suggestion).toBeNull(); // "General" ≠ "General Fund"
    expect(state.suggestedDefaultFund).toEqual({ pcoFundId: "p1", pcoFundName: "General Fund" });
  });

  it("never suggests a fund that can't receive gifts", async () => {
    db.funds.push({ id: "f4", churchId: "church1", name: "Closed", isActive: true, displayOrder: 3 });
    const state = await getGivingSetupState("church1");
    expect(state.funds.find((f) => f.name === "Closed")!.suggestion).toBeNull();
    expect(state.pcoFunds.find((f) => f.id === "p3")!.usable).toBe(false);
  });

  it("reports mapping health from live data and shows the live fund name", async () => {
    db.mappings = [
      { churchId: "church1", fundId: "f1", pcoFundId: "p1", pcoFundName: "Old name" },
      { churchId: "church1", fundId: "f2", pcoFundId: "gone", pcoFundName: "Deleted fund" },
    ];
    const state = await getGivingSetupState("church1");
    expect(state.funds[0].mapping).toEqual({ pcoFundId: "p1", pcoFundName: "General Fund", health: "OK" });
    expect(state.funds[1].mapping).toMatchObject({ pcoFundId: "gone", pcoFundName: "Deleted fund", health: "MISSING" });
    expect(state.readiness.ready).toBe(false);
  });

  it("flags a mapping to a fund set to 'nowhere' as HIDDEN", async () => {
    db.mappings = [{ churchId: "church1", fundId: "f1", pcoFundId: "p3", pcoFundName: "Closed" }];
    expect((await getGivingSetupState("church1")).funds[0].mapping!.health).toBe("HIDDEN");
  });

  it("returns pcoAccess DENIED on a 403 and records that read access is gone", async () => {
    listFundsMock.mockRejectedValue(apiError(403));
    const state = await getGivingSetupState("church1");
    expect(state.pcoAccess).toBe("DENIED");
    expect(db.connection!.canReadGiving).toBe(false);
  });

  it("returns NOT_ENABLED on a 404 without changing the stored permission flags", async () => {
    listFundsMock.mockRejectedValue(apiError(404));
    const state = await getGivingSetupState("church1");
    expect(state.pcoAccess).toBe("NOT_ENABLED");
    expect(db.connection!.canReadGiving).toBe(true);
  });

  it("clears a stale 'can't access Giving' flag once Giving is reachable again", async () => {
    db.connection!.canReadGiving = false;
    await getGivingSetupState("church1");
    expect(db.connection!.canReadGiving).toBe(true);
  });

  it("ignores a config that belongs to a different Planning Center organization", async () => {
    db.config = { id: "cfg1", churchId: "church1", pcoOrganizationId: "OLD", pcoPaymentSourceId: "s1", defaultPcoFundId: "p1", defaultPcoFundName: "General Fund" };
    const state = await getGivingSetupState("church1");
    expect(state.paymentSource.state).toBe("MISSING");
    expect(state.defaultFund).toBeNull();
  });

  it("reports an archived or deleted payment source", async () => {
    db.config = { id: "cfg1", churchId: "church1", pcoOrganizationId: "127", pcoPaymentSourceId: "s1" };
    listSourcesMock.mockResolvedValue([{ id: "s1", name: "WGC Payments", status: "archived" }]);
    expect((await getGivingSetupState("church1")).paymentSource.state).toBe("ARCHIVED");
    listSourcesMock.mockResolvedValue([]);
    expect((await getGivingSetupState("church1")).paymentSource.state).toBe("MISSING");
  });

  it("says an existing same-name source will be reused", async () => {
    listSourcesMock.mockResolvedValue([{ id: "s9", name: "wgc payments", status: "active" }]);
    expect((await getGivingSetupState("church1")).paymentSource.existingWillBeReused).toBe(true);
  });

  it("requires a connected church", async () => {
    db.connection!.status = "DISCONNECTED";
    await expect(getGivingSetupState("church1")).rejects.toBeInstanceOf(PlanningCenterConnectionError);
    db.connection!.status = "REAUTHENTICATION_REQUIRED";
    await expect(getGivingSetupState("church1")).rejects.toThrow(/reconnected/);
  });
});

describe("ensurePaymentSource", () => {
  it("creates the source when none exists, stores it, and records write access", async () => {
    createSourceMock.mockResolvedValue({ id: "s1", name: "WGC Payments", status: "active" });
    const result = await ensurePaymentSource("church1", actor);
    expect(result).toEqual({ id: "s1", name: "WGC Payments", reused: false });
    expect(touchSourceMock).not.toHaveBeenCalled();
    expect(db.config).toMatchObject({ pcoOrganizationId: "127", pcoPaymentSourceId: "s1" });
    expect(db.connection).toMatchObject({ canReadGiving: true, canWriteGiving: true });
  });

  it("reuses an existing source (case-insensitive) with a no-op write instead of creating a duplicate", async () => {
    listSourcesMock.mockResolvedValue([{ id: "s7", name: "wgc payments", status: "active" }]);
    touchSourceMock.mockResolvedValue({ id: "s7", name: "wgc payments", status: "active" });
    const result = await ensurePaymentSource("church1", actor);
    expect(createSourceMock).not.toHaveBeenCalled();
    expect(touchSourceMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "s7" }), { reactivate: false });
    expect(result.reused).toBe(true);
    expect(db.connection!.canWriteGiving).toBe(true);
  });

  it("reactivates an archived source", async () => {
    listSourcesMock.mockResolvedValue([{ id: "s7", name: "WGC Payments", status: "archived" }]);
    touchSourceMock.mockResolvedValue({ id: "s7", name: "WGC Payments", status: "active" });
    await ensurePaymentSource("church1", actor);
    expect(touchSourceMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), { reactivate: true });
  });

  it("a 403 on the write marks write access refused and tells the church how to fix it", async () => {
    createSourceMock.mockRejectedValue(apiError(403));
    await expect(ensurePaymentSource("church1", actor)).rejects.toThrow(/Finance Administrator/);
    expect(db.connection!.canWriteGiving).toBe(false);
    expect(db.config?.pcoPaymentSourceId ?? null).toBeNull();
  });

  it("a 403 on the read marks read access gone", async () => {
    listSourcesMock.mockRejectedValue(apiError(403));
    await expect(ensurePaymentSource("church1", actor)).rejects.toBeInstanceOf(PlanningCenterSetupError);
    expect(db.connection!.canReadGiving).toBe(false);
    expect(createSourceMock).not.toHaveBeenCalled();
  });

  it("a 404 means Giving isn't enabled", async () => {
    listSourcesMock.mockRejectedValue(apiError(404));
    await expect(ensurePaymentSource("church1", actor)).rejects.toThrow(/Giving doesn't appear to be turned on/);
  });

  it("adopts the source if it was created by someone else between our read and our write", async () => {
    createSourceMock.mockRejectedValue(apiError(422));
    listSourcesMock.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "s5", name: "WGC Payments", status: "active" }]);
    touchSourceMock.mockResolvedValue({ id: "s5", name: "WGC Payments", status: "active" });
    const result = await ensurePaymentSource("church1", actor);
    expect(result.id).toBe("s5");
  });

  it("is idempotent: running it twice leaves one config row and one source id", async () => {
    createSourceMock.mockResolvedValue({ id: "s1", name: "WGC Payments", status: "active" });
    await ensurePaymentSource("church1", actor);
    listSourcesMock.mockResolvedValue([{ id: "s1", name: "WGC Payments", status: "active" }]);
    touchSourceMock.mockResolvedValue({ id: "s1", name: "WGC Payments", status: "active" });
    await ensurePaymentSource("church1", actor);
    expect(createSourceMock).toHaveBeenCalledTimes(1);
    expect(db.config!.pcoPaymentSourceId).toBe("s1");
  });
});

describe("saveFundMapping", () => {
  it("maps a fund after re-checking it live", async () => {
    await expect(saveFundMapping("church1", "f2", "p2", actor)).resolves.toEqual({ pcoFundId: "p2", pcoFundName: "missions" });
    expect(db.mappings).toEqual([expect.objectContaining({ churchId: "church1", fundId: "f2", pcoFundId: "p2", mappedByUserId: "u1" })]);
  });

  it("re-mapping replaces rather than duplicates", async () => {
    await saveFundMapping("church1", "f2", "p2", actor);
    await saveFundMapping("church1", "f2", "p1", actor);
    expect(db.mappings).toHaveLength(1);
    expect(db.mappings[0].pcoFundId).toBe("p1");
  });

  it("refuses a fund that belongs to another church, before touching Planning Center", async () => {
    await expect(saveFundMapping("church1", "other", "p1", actor)).rejects.toThrow(/wasn't found/);
    expect(listFundsMock).not.toHaveBeenCalled();
    expect(db.mappings).toHaveLength(0);
  });

  it("refuses an inactive fund, a missing Planning Center fund and a 'nowhere' fund", async () => {
    await expect(saveFundMapping("church1", "f3", "p1", actor)).rejects.toThrow(/active funds/);
    await expect(saveFundMapping("church1", "f1", "does-not-exist", actor)).rejects.toThrow(/no longer exists/);
    await expect(saveFundMapping("church1", "f1", "p3", actor)).rejects.toThrow(/can't receive gifts/);
    expect(db.mappings).toHaveLength(0);
  });

  it("null removes the mapping, even for an inactive fund, without calling Planning Center", async () => {
    db.mappings = [{ churchId: "church1", fundId: "f3", pcoFundId: "p1", pcoFundName: "x" }];
    await expect(saveFundMapping("church1", "f3", null, actor)).resolves.toBeNull();
    expect(db.mappings).toHaveLength(0);
    expect(listFundsMock).not.toHaveBeenCalled();
  });
});

describe("createPlanningCenterFund", () => {
  it("creates the fund in Planning Center and maps to it", async () => {
    createFundMock.mockResolvedValue(pcoFund("p9", "Missions", { visibility: "admin_only" }));
    listFundsMock.mockResolvedValue([pcoFund("p1", "General Fund")]);
    await expect(createPlanningCenterFund("church1", "f2", actor)).resolves.toEqual({ pcoFundId: "p9", pcoFundName: "Missions" });
    expect(createFundMock).toHaveBeenCalledWith(expect.anything(), { name: "Missions", description: "Mission trips" });
    expect(db.mappings[0]).toMatchObject({ fundId: "f2", pcoFundId: "p9" });
  });

  it("never creates a duplicate: a same-name fund (any case) is a collision, with no POST", async () => {
    await expect(createPlanningCenterFund("church1", "f2", actor)).rejects.toThrow(/already exists in Planning Center/); // "missions" exists
    expect(createFundMock).not.toHaveBeenCalled();
  });

  it("treats a 422 from a create race as a collision", async () => {
    listFundsMock.mockResolvedValue([]);
    createFundMock.mockRejectedValue(apiError(422));
    await expect(createPlanningCenterFund("church1", "f2", actor)).rejects.toThrow(/already exists in Planning Center/);
  });

  it("refuses an already-mapped fund, a foreign fund and an inactive fund", async () => {
    db.mappings = [{ churchId: "church1", fundId: "f2", pcoFundId: "p2", pcoFundName: "missions" }];
    await expect(createPlanningCenterFund("church1", "f2", actor)).rejects.toThrow(/already mapped/);
    await expect(createPlanningCenterFund("church1", "other", actor)).rejects.toThrow(/wasn't found/);
    await expect(createPlanningCenterFund("church1", "f3", actor)).rejects.toThrow(/active funds/);
    expect(createFundMock).not.toHaveBeenCalled();
  });

  it("explains a 403 clearly", async () => {
    listFundsMock.mockResolvedValue([]);
    createFundMock.mockRejectedValue(apiError(403));
    await expect(createPlanningCenterFund("church1", "f2", actor)).rejects.toThrow(/Finance Administrator/);
  });
});

describe("setDefaultFund", () => {
  it("saves a usable fund and creates the config on first use", async () => {
    await expect(setDefaultFund("church1", "p1", actor)).resolves.toEqual({ pcoFundId: "p1", pcoFundName: "General Fund" });
    expect(db.config).toMatchObject({ pcoOrganizationId: "127", defaultPcoFundId: "p1", defaultPcoFundName: "General Fund" });
  });

  it("rejects unknown and 'nowhere' funds, and null clears it", async () => {
    await expect(setDefaultFund("church1", "nope", actor)).rejects.toThrow(/no longer exists/);
    await expect(setDefaultFund("church1", "p3", actor)).rejects.toThrow(/can't receive gifts/);
    await setDefaultFund("church1", "p1", actor);
    await expect(setDefaultFund("church1", null, actor)).resolves.toBeNull();
    expect(db.config!.defaultPcoFundId).toBeNull();
  });
});

describe("applySuggestedMappings", () => {
  it("maps only unmapped, active funds with an exact usable name match and leaves existing mappings alone", async () => {
    db.funds.push({ id: "f5", churchId: "church1", name: "Closed", isActive: true, displayOrder: 4 }); // matches only a 'nowhere' fund
    db.mappings = [{ churchId: "church1", fundId: "f1", pcoFundId: "p1", pcoFundName: "General Fund" }];
    const result = await applySuggestedMappings("church1", actor);
    expect(result).toEqual({ mapped: 1, skipped: 1 });
    expect(db.mappings.map((m) => m.fundId).sort()).toEqual(["f1", "f2"]);
    expect(db.mappings.find((m) => m.fundId === "f1")!.pcoFundId).toBe("p1");
  });

  it("is a harmless no-op when there is nothing to match", async () => {
    listFundsMock.mockResolvedValue([pcoFund("p1", "Unrelated")]);
    await expect(applySuggestedMappings("church1", actor)).resolves.toEqual({ mapped: 0, skipped: 2 });
    expect(db.mappings).toHaveLength(0);
  });
});
