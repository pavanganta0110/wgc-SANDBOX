/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = { configs: [] as any[], connections: [] as any[], settlements: [] as any[], records: [] as any[] };
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterSyncConfig: {
      findUnique: async ({ where }: any) => state.configs.find((c) => c.churchId === where.churchId) ?? null,
      findMany: async ({ where }: any) => state.configs.filter((c) => where.syncMode.in.includes(c.syncMode)),
    },
    planningCenterConnection: { findMany: async ({ where }: any) => state.connections.filter((c) => where.churchId.in.includes(c.churchId) && c.status === where.status) },
    finixSettlement: {
      findMany: async ({ where }: any) =>
        state.settlements.filter((s) => s.churchId === where.churchId && s.state === "SETTLED" && s.settledAt >= where.settledAt.gte).sort((a, b) => a.settledAt - b.settledAt),
    },
    planningCenterSyncRecord: { findMany: async ({ where }: any) => state.records.filter((r) => r.churchId === where.churchId && where.settlementId.in.includes(r.settlementId)) },
  },
}));

const engine = vi.fn();
vi.mock("../syncEngine", () => ({ DEFAULT_TIME_BUDGET_MS: 45_000, processSettlementSync: (...a: unknown[]) => engine(...a) }));
let platformOn = true;
vi.mock("../config", () => ({ isPlanningCenterSyncEnabled: () => platformOn }));

import { needsAttention, runSyncForAllChurches, runSyncForChurch } from "../syncRunner";

const T = new Date("2026-10-13T12:00:00Z");
const now = () => T;
const ago = (days: number) => new Date(T.getTime() - days * 86400_000);
const settlement = (id: string, days: number, churchId = "c1") => ({ finixSettlementId: id, churchId, state: "SETTLED", settledAt: ago(days) });

beforeEach(() => {
  state.configs = [{ churchId: "c1", syncMode: "LIVE", enabledAt: ago(5), syncVersion: 1, autoCommitBatches: false }];
  state.connections = [{ churchId: "c1", status: "CONNECTED" }];
  state.settlements = [];
  state.records = [];
  engine.mockReset();
  engine.mockResolvedValue("SYNCED");
  platformOn = true;
});

describe("needsAttention", () => {
  const rec = (status: string, over: any = {}) => ({ status, commitStatus: "N_A", nextAttemptAt: null, ...over });
  it("a settlement with no record yet needs attention", () => expect(needsAttention(undefined, "LIVE", false, T)).toBe(true));
  it("things only a person can move are left alone", () => {
    for (const s of ["NEEDS_REVIEW", "FAILED", "CANCELLED"]) expect(needsAttention(rec(s), "LIVE", false, T)).toBe(false);
  });
  it("a finished settlement needs attention only while its commit is unsettled", () => {
    expect(needsAttention(rec("SYNCED", { commitStatus: "COMMITTED" }), "LIVE", true, T)).toBe(false);
    expect(needsAttention(rec("SYNCED", { commitStatus: "COMMITTING" }), "LIVE", false, T)).toBe(true);
    expect(needsAttention(rec("SYNCED", { commitStatus: "NOT_COMMITTED" }), "LIVE", true, T)).toBe(true);
    expect(needsAttention(rec("SYNCED", { commitStatus: "NOT_COMMITTED" }), "LIVE", false, T)).toBe(false);
  });
  it("a stored dry run is only revisited when going live", () => {
    expect(needsAttention(rec("DRY_RUN"), "DRY_RUN", false, T)).toBe(false);
    expect(needsAttention(rec("DRY_RUN"), "LIVE", false, T)).toBe(true);
  });
  it("scheduled retries and partial settlements wait for their time", () => {
    for (const s of ["RETRY_SCHEDULED", "PARTIAL"]) {
      expect(needsAttention(rec(s, { nextAttemptAt: new Date(T.getTime() + 60_000) }), "LIVE", false, T)).toBe(false);
      expect(needsAttention(rec(s, { nextAttemptAt: new Date(T.getTime() - 60_000) }), "LIVE", false, T)).toBe(true);
    }
  });
});

describe("runSyncForChurch", () => {
  it("does nothing when sync is off or LIVE has no watermark", async () => {
    state.configs[0].syncMode = "OFF";
    expect((await runSyncForChurch("c1", { now })).settlementsProcessed).toBe(0);
    state.configs[0].syncMode = "LIVE";
    state.configs[0].enabledAt = null;
    expect((await runSyncForChurch("c1", { now })).settlementsProcessed).toBe(0);
    expect(engine).not.toHaveBeenCalled();
  });

  it("LIVE looks only at settlements on/after the go-live watermark, oldest first", async () => {
    state.settlements = [settlement("old", 30), settlement("b", 2), settlement("a", 4)];
    await runSyncForChurch("c1", { now });
    expect(engine.mock.calls.map((c) => c[1])).toEqual(["a", "b"]);
  });

  it("DRY_RUN looks back 14 days", async () => {
    state.configs[0] = { ...state.configs[0], syncMode: "DRY_RUN", enabledAt: null };
    state.settlements = [settlement("ancient", 40), settlement("recent", 10)];
    await runSyncForChurch("c1", { now });
    expect(engine.mock.calls.map((c) => c[1])).toEqual(["recent"]);
  });

  it("skips settlements that are finished or waiting, and only counts what it processed", async () => {
    state.settlements = [settlement("done", 4), settlement("review", 3), settlement("fresh", 2)];
    state.records = [
      { churchId: "c1", settlementId: "done", status: "SYNCED", commitStatus: "COMMITTED", nextAttemptAt: null },
      { churchId: "c1", settlementId: "review", status: "NEEDS_REVIEW", commitStatus: "N_A", nextAttemptAt: null },
    ];
    const summary = await runSyncForChurch("c1", { now });
    expect(engine.mock.calls.map((c) => c[1])).toEqual(["fresh"]);
    expect(summary).toMatchObject({ settlementsProcessed: 1, outcomes: { SYNCED: 1 } });
  });

  it("never looks at another church's settlements", async () => {
    state.settlements = [settlement("mine", 2), settlement("theirs", 2, "c2")];
    await runSyncForChurch("c1", { now });
    expect(engine.mock.calls.map((c) => c[1])).toEqual(["mine"]);
  });

  it("stops when the time budget is spent and says so", async () => {
    state.settlements = [settlement("a", 4), settlement("b", 3), settlement("c", 2)];
    let t = T.getTime();
    engine.mockImplementation(async () => { t += 30_000; return "SYNCED"; });
    const summary = await runSyncForChurch("c1", { now: () => new Date(t), timeBudgetMs: 45_000 });
    expect(summary.settlementsProcessed).toBe(2);
    expect(summary.stoppedForTime).toBe(true);
  });
});

describe("runSyncForAllChurches", () => {
  it("does nothing at all while the platform switch is off", async () => {
    platformOn = false;
    state.settlements = [settlement("a", 2)];
    const out = await runSyncForAllChurches({ now });
    expect(out.skipped).toMatch(/PLANNING_CENTER_SYNC_ENABLED/);
    expect(engine).not.toHaveBeenCalled();
  });

  it("skips churches that aren't connected and isolates a failing church from the rest", async () => {
    state.configs = ["c1", "c2", "c3"].map((id) => ({ churchId: id, syncMode: "LIVE", enabledAt: ago(5), syncVersion: 1, autoCommitBatches: false }));
    state.connections = [{ churchId: "c1", status: "CONNECTED" }, { churchId: "c3", status: "CONNECTED" }];
    state.settlements = [settlement("s1", 2, "c1"), settlement("s2", 2, "c2"), settlement("s3", 2, "c3")];
    vi.spyOn(console, "error").mockImplementation(() => {});
    engine.mockImplementation(async (churchId: string) => { if (churchId === "c1") throw new Error("boom"); return "SYNCED"; });
    const out = await runSyncForAllChurches({ now });
    const called = engine.mock.calls.map((c) => c[0]).sort();
    expect(called).toEqual(["c1", "c3"]);
    expect(out.outcomes.SYNCED).toBe(1);
    expect(out.outcomes.FAILED).toBe(1);
  });
});
