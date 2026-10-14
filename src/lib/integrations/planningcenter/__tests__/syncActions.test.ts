/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of a few Prisma tables */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { connection: null as Row | null, config: null as Row | null, records: [] as Row[], donations: [] as Row[], attempts: [] as Row[] };

const eq = (row: Row, where: Row) => Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterConnection: { findUnique: async () => db.connection },
    planningCenterSyncConfig: {
      findUnique: async () => db.config,
      create: async ({ data }: any) => (db.config = { id: "cfg", syncMode: "OFF", enabledAt: null, unmatchedDonorPolicy: "HOLD_FOR_REVIEW", autoCommitBatches: false, ...data }),
      update: async ({ data }: any) => Object.assign(db.config!, data),
    },
    planningCenterSyncAttempt: { count: async ({ where }: any) => db.attempts.filter((a) => eq(a, where)).length },
    planningCenterSyncRecord: {
      findFirst: async ({ where }: any) => db.records.find((r) => eq(r, where)) ?? null,
      update: async ({ where, data }: any) => Object.assign(db.records.find((r) => r.id === where.id)!, data),
      updateMany: async ({ where, data }: any) => { const hit = db.records.filter((r) => eq(r, where)); hit.forEach((r) => Object.assign(r, data)); return { count: hit.length }; },
    },
    planningCenterDonationRecord: {
      findFirst: async ({ where }: any) => db.donations.find((d) => eq(d, where)) ?? null,
      update: async ({ where, data }: any) => Object.assign(db.donations.find((d) => d.id === where.id)!, data),
      updateMany: async ({ where, data }: any) => { const hit = db.donations.filter((d) => eq(d, where)); hit.forEach((d) => Object.assign(d, data)); return { count: hit.length }; },
      count: async ({ where }: any) => db.donations.filter((d) => eq(d, where)).length,
    },
  },
}));
vi.mock("@/lib/dashboardAudit", () => ({ logDashboardAction: vi.fn(async () => {}) }));
let platformOn = true;
vi.mock("../config", () => ({ isPlanningCenterSyncEnabled: () => platformOn }));
const readiness = { value: { ready: true, reasons: [] as string[], notes: [] as string[] } };
vi.mock("../syncConfig", () => ({
  computeStoredGivingReadiness: async () => readiness.value,
  ensureSyncConfig: async (churchId: string, org: string) => db.config ?? (db.config = { id: "cfg", churchId, pcoOrganizationId: org, syncMode: "OFF", enabledAt: null, unmatchedDonorPolicy: "HOLD_FOR_REVIEW", autoCommitBatches: false }),
}));
const runMock = vi.fn<(...args: unknown[]) => Promise<{ churchesChecked: number; settlementsProcessed: number; outcomes: object; stoppedForTime: boolean }>>(async () => ({ churchesChecked: 1, settlementsProcessed: 2, outcomes: {}, stoppedForTime: false }));
vi.mock("../syncRunner", () => ({ runSyncForChurch: (...a: unknown[]) => runMock(...a) }));

import { retrySyncRecord, resolveDonationRecord, syncNow, updateSyncSettings } from "../syncActions";

const actor = { userId: "u1" };
const NOW = new Date("2026-10-13T12:00:00Z");

beforeEach(() => {
  db.connection = { churchId: "c1", status: "CONNECTED", pcoOrganizationId: "org1" };
  db.config = { id: "cfg", churchId: "c1", pcoOrganizationId: "org1", syncMode: "OFF", enabledAt: null, unmatchedDonorPolicy: "HOLD_FOR_REVIEW", autoCommitBatches: false };
  db.records = []; db.donations = []; db.attempts = [];
  platformOn = true;
  readiness.value = { ready: true, reasons: [], notes: [] };
  runMock.mockClear();
});

describe("updateSyncSettings", () => {
  it("requires a connected church", async () => {
    db.connection!.status = "DISCONNECTED";
    await expect(updateSyncSettings("c1", { syncMode: "DRY_RUN" }, actor, NOW)).rejects.toThrow(/Connect Planning Center/);
  });

  it("sync can't be turned on while the platform switch is off", async () => {
    platformOn = false;
    await expect(updateSyncSettings("c1", { syncMode: "DRY_RUN" }, actor, NOW)).rejects.toThrow(/isn't available yet/);
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("can't be turned on until Giving setup is complete, and says what's missing", async () => {
    readiness.value = { ready: false, reasons: ["Choose a default Planning Center fund."], notes: [] };
    await expect(updateSyncSettings("c1", { syncMode: "DRY_RUN" }, actor, NOW)).rejects.toThrow(/Choose a default Planning Center fund/);
  });

  it("preview is allowed first; it does NOT set the go-live watermark", async () => {
    await updateSyncSettings("c1", { syncMode: "DRY_RUN" }, actor, NOW);
    expect(db.config).toMatchObject({ syncMode: "DRY_RUN", enabledAt: null });
  });

  it("LIVE is refused until a preview has actually run", async () => {
    await expect(updateSyncSettings("c1", { syncMode: "LIVE" }, actor, NOW)).rejects.toThrow(/Run a preview first/);
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("going LIVE after a preview sets the watermark to now", async () => {
    db.attempts.push({ churchId: "c1", outcome: "DRY_RUN" });
    db.config!.syncMode = "DRY_RUN";
    await updateSyncSettings("c1", { syncMode: "LIVE" }, actor, NOW);
    expect(db.config).toMatchObject({ syncMode: "LIVE", enabledAt: NOW });
  });

  it("pausing to PREVIEW keeps the watermark; switching OFF clears it, so re-enabling never back-posts the gap", async () => {
    db.attempts.push({ churchId: "c1", outcome: "DRY_RUN" });
    db.config = { ...db.config!, syncMode: "LIVE", enabledAt: new Date("2026-10-01T00:00:00Z") };
    await updateSyncSettings("c1", { syncMode: "DRY_RUN" }, actor, NOW);
    expect(db.config!.enabledAt).toEqual(new Date("2026-10-01T00:00:00Z"));
    await updateSyncSettings("c1", { syncMode: "OFF" }, actor, NOW);
    expect(db.config!.enabledAt).toBeNull();
    await updateSyncSettings("c1", { syncMode: "LIVE" }, actor, NOW);
    expect(db.config!.enabledAt).toEqual(NOW);
  });

  it("turning sync OFF is always allowed, even if setup is broken or the platform switch is off", async () => {
    db.config!.syncMode = "LIVE";
    platformOn = false;
    readiness.value = { ready: false, reasons: ["x"], notes: [] };
    await updateSyncSettings("c1", { syncMode: "OFF" }, actor, NOW);
    expect(db.config!.syncMode).toBe("OFF");
  });

  it("validates the unmatched-donor policy and updates policy and auto-commit independently", async () => {
    await expect(updateSyncSettings("c1", { unmatchedDonorPolicy: "DELETE_THEM" as any }, actor, NOW)).rejects.toThrow(/valid option/);
    await updateSyncSettings("c1", { unmatchedDonorPolicy: "ANONYMOUS", autoCommitBatches: true }, actor, NOW);
    expect(db.config).toMatchObject({ unmatchedDonorPolicy: "ANONYMOUS", autoCommitBatches: true, syncMode: "OFF" });
  });

  it("rejects an invalid mode", async () => {
    await expect(updateSyncSettings("c1", { syncMode: "TURBO" as any }, actor, NOW)).rejects.toThrow(/valid sync mode/);
  });
});

describe("retrySyncRecord", () => {
  const rec = (status: string) => ({ id: "r1", churchId: "c1", settlementId: "ST1", status, attemptCount: 5 });
  it("re-opens a failed deposit and puts definitely-rejected gifts back to pending", async () => {
    db.records = [rec("FAILED")];
    db.donations = [{ id: "d1", syncRecordId: "r1", status: "FAILED" }, { id: "d2", syncRecordId: "r1", status: "CREATED" }];
    await retrySyncRecord("c1", "r1", actor);
    expect(db.records[0]).toMatchObject({ status: "PENDING", attemptCount: 0, lastNotifiedStatus: null });
    expect(db.donations.map((d) => d.status)).toEqual(["PENDING", "CREATED"]);
  });

  it("will NOT retry a deposit that needs review (the flagged gifts must be resolved first), or one that's fine", async () => {
    db.records = [rec("NEEDS_REVIEW")];
    await expect(retrySyncRecord("c1", "r1", actor)).rejects.toThrow(/need your review/);
    db.records = [rec("SYNCED")];
    await expect(retrySyncRecord("c1", "r1", actor)).rejects.toThrow(/doesn't need a retry/);
  });

  it("another church's deposit is simply not found", async () => {
    db.records = [{ ...rec("FAILED"), churchId: "c2" }];
    await expect(retrySyncRecord("c1", "r1", actor)).rejects.toThrow(/wasn't found/);
  });
});

describe("resolveDonationRecord", () => {
  beforeEach(() => {
    db.records = [{ id: "r1", churchId: "c1", status: "NEEDS_REVIEW", requiresManualReview: true }];
    db.donations = [
      { id: "d1", syncRecordId: "r1", churchId: "c1", paymentId: "p1", status: "NEEDS_REVIEW" },
      { id: "d2", syncRecordId: "r1", churchId: "c1", paymentId: "p2", status: "NEEDS_REVIEW" },
    ];
  });

  it("RETRY (the church confirmed it isn't in Planning Center) sends it back to pending; the deposit waits for the others", async () => {
    await resolveDonationRecord("c1", "d1", "RETRY", actor);
    expect(db.donations[0].status).toBe("PENDING");
    expect(db.records[0].status).toBe("NEEDS_REVIEW");
  });

  it("SKIP records the decision, and once nothing is left to review the deposit continues", async () => {
    await resolveDonationRecord("c1", "d1", "SKIP", actor);
    await resolveDonationRecord("c1", "d2", "RETRY", actor);
    expect(db.donations[0]).toMatchObject({ status: "SKIPPED", skippedReason: "MANUAL" });
    expect(db.records[0]).toMatchObject({ status: "PENDING", requiresManualReview: false });
  });

  it("only gifts waiting on a decision can be resolved, and only in your own church", async () => {
    db.donations[0].status = "CREATED";
    await expect(resolveDonationRecord("c1", "d1", "SKIP", actor)).rejects.toThrow(/doesn't need a decision/);
    db.donations[1].churchId = "c2";
    await expect(resolveDonationRecord("c1", "d2", "SKIP", actor)).rejects.toThrow(/wasn't found/);
    await expect(resolveDonationRecord("c1", "d1", "DELETE" as any, actor)).rejects.toThrow();
  });
});

describe("syncNow", () => {
  it("runs a bounded pass for this church only", async () => {
    const out = await syncNow("c1", actor);
    expect(runMock).toHaveBeenCalledWith("c1", expect.objectContaining({ timeBudgetMs: 25_000 }));
    expect(out.settlementsProcessed).toBe(2);
  });
  it("does nothing while the platform switch is off", async () => {
    platformOn = false;
    await expect(syncNow("c1", actor)).rejects.toThrow(/isn't available yet/);
    expect(runMock).not.toHaveBeenCalled();
  });
});
