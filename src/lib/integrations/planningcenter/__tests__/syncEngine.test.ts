/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes of Prisma tables and Planning Center */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;

// ───────────────────────────── in-memory database ─────────────────────────────

const barrier = { size: 0, arrived: 0, release: null as null | (() => void), gate: null as null | Promise<void> };
const db = {
  config: null as Row | null,
  connection: null as Row | null,
  settlements: [] as Row[],
  mappings: [] as Row[],
  donors: [] as Row[],
  syncRecords: [] as Row[],
  donationRecords: [] as Row[],
  attempts: [] as Row[],
  links: [] as Row[],
};
let clock = 1;
let idSeq = 1;
/** Forces concurrent claimants to reach the claim together, so the claim's own atomicity is what decides the winner. */
function withClaimBarrier(ops: any) {
  const original = ops.updateMany;
  ops.updateMany = async (args: any) => {
    if (barrier.size > 0 && args.data?.status === "PROCESSING") {
      barrier.arrived++;
      if (barrier.arrived >= barrier.size) barrier.release?.();
      await barrier.gate;
    }
    return original(args);
  };
  return ops;
}

function bump() {
  return new Date(1_700_000_000_000 + clock++);
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "NOT") return !matches(row, cond);
    if (key === "churchId_settlementId_syncVersion") return row.churchId === cond.churchId && row.settlementId === cond.settlementId && row.syncVersion === cond.syncVersion;
    if (key === "churchId_donorId") return row.churchId === cond.churchId && row.donorId === cond.donorId;
    if (cond instanceof Date) return row[key] instanceof Date && row[key].getTime() === cond.getTime();
    if (cond && typeof cond === "object" && !Array.isArray(cond)) {
      if ("in" in cond) return cond.in.includes(row[key]);
      if ("notIn" in cond) return !cond.notIn.includes(row[key]);
      if ("not" in cond) return cond.not === null ? row[key] !== null && row[key] !== undefined : row[key] !== cond.not;
      return false;
    }
    return row[key] === cond;
  });
}
function apply(row: Row, data: Row) {
  for (const [k, v] of Object.entries(data)) {
    row[k] = v && typeof v === "object" && !(v instanceof Date) && "increment" in v ? (row[k] ?? 0) + v.increment : v;
  }
  row.updatedAt = bump();
  return row;
}
function tableOps(rows: () => Row[], push: (r: Row) => void, defaults: () => Row, uniqueOn?: string[]) {
  return {
  findUnique: async ({ where }: any) => rows().find((r) => matches(r, where)) ?? null,
  findFirst: async ({ where }: any) => rows().find((r) => matches(r, where)) ?? null,
  findMany: async ({ where = {}, select }: any = {}) => {
    const out = rows().filter((r) => matches(r, where));
    return select ? out.map((r) => Object.fromEntries(Object.keys(select).map((k) => [k, r[k]]))) : out.map((r) => r);
  },
  count: async ({ where = {} }: any = {}) => rows().filter((r) => matches(r, where)).length,
  create: async ({ data }: any) => {
    // Mirrors the real unique constraint: a second create for the same settlement is a P2002.
    if (uniqueOn && rows().some((r) => uniqueOn.every((k) => r[k] === data[k]))) {
      const { Prisma } = await import("@prisma/client");
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "x" });
    }
    const row = { id: `id${idSeq++}`, createdAt: bump(), updatedAt: bump(), ...defaults(), ...data };
    push(row);
    return row;
  },
  update: async ({ where, data }: any) => apply(rows().find((r) => matches(r, where))!, data),
  updateMany: async ({ where, data }: any) => {
    const hit = rows().filter((r) => matches(r, where));
    hit.forEach((r) => apply(r, data));
    return { count: hit.length };
  },
};
}

vi.mock("@/lib/prisma", () => {
  const prisma: any = {
    planningCenterSyncConfig: { findUnique: async () => db.config },
    planningCenterConnection: { findUnique: async () => db.connection, updateMany: async ({ data }: any) => { if (db.connection) Object.assign(db.connection, data); return { count: 1 }; } },
    finixSettlement: { findUnique: async ({ where }: any) => db.settlements.find((s) => s.finixSettlementId === where.finixSettlementId) ?? null },
    planningCenterFundMapping: { findMany: async () => db.mappings },
    donor: { findMany: async ({ where }: any) => db.donors.filter((d) => d.churchId === where.churchId && where.id.in.includes(d.id)) },
    planningCenterSyncRecord: withClaimBarrier(tableOps(() => db.syncRecords, (r) => db.syncRecords.push(r), () => ({ status: "PENDING", attemptCount: 0, commitStatus: "N_A", pcoBatchId: null, startedAt: null, lastAttemptAt: null, nextAttemptAt: null, lastNotifiedStatus: null }), ["churchId", "settlementId", "syncVersion"])),
    planningCenterDonationRecord: {
      ...tableOps(() => db.donationRecords, (r) => db.donationRecords.push(r), () => ({ status: "PENDING", attemptCount: 0, pcoDonationId: null, sendingStartedAt: null, skippedReason: null, lastErrorCode: null, lastErrorMessage: null })),
      createMany: async ({ data, skipDuplicates }: any) => {
        let count = 0;
        for (const d of data) {
          if (skipDuplicates && db.donationRecords.some((r) => r.churchId === d.churchId && r.paymentId === d.paymentId)) continue;
          db.donationRecords.push({ id: `id${idSeq++}`, createdAt: bump(), updatedAt: bump(), attemptCount: 0, pcoDonationId: null, sendingStartedAt: null, lastErrorCode: null, lastErrorMessage: null, ...d });
          count++;
        }
        return { count };
      },
    },
    planningCenterSyncAttempt: { create: async ({ data }: any) => { db.attempts.push(data); return data; } },
    planningCenterPersonLink: {
      upsert: async ({ where, create, update }: any) => {
        const existing = db.links.find((l) => matches(l, where));
        if (existing) return Object.assign(existing, update);
        db.links.push({ ...create });
        return create;
      },
      updateMany: async ({ where, data }: any) => { const hit = db.links.filter((l) => matches(l, where)); hit.forEach((l) => Object.assign(l, data)); return { count: hit.length }; },
    },
  };
  return { prisma };
});

// ──────────────────────────── fake Planning Center ────────────────────────────

const pco = {
  batches: [] as Row[],
  donations: [] as Row[], // { id, batchId, amountCents, receivedOn, personId, paymentSourceId, feeCents }
  calls: [] as string[],
  // fault injection, consumed in order
  donationFaults: [] as Array<"timeout-after-create" | "timeout-before-create" | "422" | "403" | "401" | "500-after-create">,
  batchFaults: [] as Array<"timeout-after-create" | "timeout-before-create" | "500">,
  readFaults: [] as Array<"503">,
  mutateAfterCreate: null as null | ((d: Row) => void),
  batchStatusOnGet: null as null | string,
};
const apiErr = (status: number, category = "UNKNOWN_ERROR") => new (PlanningCenterApiErrorRef.cls)({ category, retryable: status >= 500 || status === 0, safeMessage: "x" }, status);
const PlanningCenterApiErrorRef = { cls: null as any };

vi.mock("../givingApi", async () => {
  const actual = await vi.importActual<typeof import("../givingApi")>("../givingApi");
  return {
    ...actual,
    createBatch: async (_c: unknown, description: string) => {
      pco.calls.push("createBatch");
      const fault = pco.batchFaults.shift();
      if (fault === "timeout-before-create") throw apiErr(0);
      if (fault === "500") throw apiErr(503);
      const b = { id: `b${pco.batches.length + 1}`, description, status: "in_progress" };
      pco.batches.push(b);
      if (fault === "timeout-after-create") throw apiErr(0);
      return { ...b };
    },
    findBatchByDescription: async (_c: unknown, description: string) => {
      pco.calls.push("findBatch");
      if (pco.readFaults.shift() === "503") throw apiErr(503);
      const hit = pco.batches.find((b) => b.description === description);
      return hit ? { ...hit } : null;
    },
    getBatch: async (_c: unknown, id: string) => {
      pco.calls.push("getBatch");
      const b = pco.batches.find((x) => x.id === id);
      return b ? { ...b, status: pco.batchStatusOnGet ?? b.status } : null;
    },
    listBatchDonations: async (_c: unknown, batchId: string) => {
      pco.calls.push("listDonations");
      return pco.donations.filter((d) => d.batchId === batchId).map((d) => ({ ...d }));
    },
    createDonation: async (_c: unknown, batchId: string, body: any) => {
      pco.calls.push("createDonation");
      const fault = pco.donationFaults.shift();
      if (fault === "timeout-before-create") throw apiErr(0);
      if (fault === "422") throw apiErr(422, "VALIDATION_ERROR");
      if (fault === "403") throw apiErr(403, "ACCESS_DENIED");
      if (fault === "401") throw apiErr(401, "AUTHENTICATION_REQUIRED");
      const attrs = body.data.attributes;
      const d = {
        id: `pd${pco.donations.length + 1}`, batchId, amountCents: body.included[0].attributes.amount_cents, receivedOn: attrs.received_at,
        personId: body.data.relationships.person?.data.id ?? null, paymentSourceId: body.data.relationships.payment_source.data.id, feeCents: attrs.fee_cents,
      };
      pco.donations.push(d);
      pco.mutateAfterCreate?.(d);
      if (fault === "timeout-after-create") throw apiErr(0);
      if (fault === "500-after-create") throw apiErr(503);
      return { id: d.id };
    },
    commitBatch: async (_c: unknown, id: string) => {
      pco.calls.push("commit");
      const b = pco.batches.find((x) => x.id === id)!;
      b.status = "committed";
    },
  };
});

// ───────────────────────────── other collaborators ─────────────────────────────

const gifts = { list: [] as any[], plan: null as any };
vi.mock("../giftPlan", async () => {
  const actual = await vi.importActual<typeof import("../giftPlan")>("../giftPlan");
  return {
    ...actual,
    buildSettlementPlan: async () => gifts.plan ?? { eligible: true, awaitingFees: false, reasons: [], safeMessage: "Eligible.", gifts: gifts.list, settledAt: new Date("2026-10-11T00:00:00Z") },
    // "As soon as it's paid": the day plan is just whatever gifts exist right now.
    buildDayPlan: async () => ({ eligible: true, awaitingFees: false, reasons: [], safeMessage: "Eligible.", gifts: gifts.list, settledAt: new Date("2026-10-14T00:00:00Z") }),
    dayHasWork: async () =>
      gifts.list.some((g) => {
        const rec = db.donationRecords.find((r) => r.paymentId === g.paymentId);
        return !rec || rec.status === "PENDING" || rec.status === "SENDING";
      }),
  };
});
const linkStates = new Map<string, { status: string; pcoPersonId: string | null }>();
vi.mock("../personMatching", () => ({ resolveDonorLink: async (_c: string, donorId: string) => linkStates.get(donorId) ?? { status: "NO_MATCH", pcoPersonId: null } }));
const createPersonMock = vi.fn();
vi.mock("../people", () => ({ createPerson: (...a: unknown[]) => createPersonMock(...a) }));
const notifyReview = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
const notifyFailed = vi.fn<(...args: unknown[]) => Promise<void>>(async () => {});
vi.mock("../notifications", () => ({ notifySyncNeedsReview: (...a: unknown[]) => notifyReview(...a), notifySyncFailed: (...a: unknown[]) => notifyFailed(...a) }));
const readiness = { value: { ready: true, reasons: [] as string[], notes: [] as string[] } };
vi.mock("../syncConfig", () => ({ computeStoredGivingReadiness: async () => readiness.value }));
vi.mock("../service", () => ({ getClientForChurch: async () => ({}) }));

import { PlanningCenterApiError } from "../errors";
import { RECONCILE_GRACE_MS } from "../syncReconcile";
import { classifyWriteError, processDaySync, processSettlementSync, STALE_PROCESSING_MS } from "../syncEngine";
PlanningCenterApiErrorRef.cls = PlanningCenterApiError;

// ─────────────────────────────────── helpers ───────────────────────────────────

const T0 = new Date("2026-10-13T12:00:00Z");
let nowMs = T0.getTime();
const now = () => new Date(nowMs);
const advance = (ms: number) => { nowMs += ms; };
const client = {} as any;
const run = (opts: Record<string, any> = {}) => processSettlementSync("c1", "ST1", { client, now, ...opts });

const gift = (n: number, over: Row = {}) => ({
  paymentId: `pay${n}`, finixTransferId: `TR${n}`, donorId: `d${n}`, fundId: "f1", isAnonymous: false, amountCents: 1000 * n, receivedOn: "2026-10-10",
  feeCents: -50, method: "card", cardBrand: "Visa", cardSubtype: "credit", last4: "4242", decision: { kind: "PUSH" }, ...over,
});
const skippedGift = (n: number, reason = "REFUNDED") => gift(n, { decision: { kind: "SKIP", reason } });

function seed(n = 3, over: { config?: Row } = {}) {
  db.config = {
    id: "cfg1", churchId: "c1", pcoOrganizationId: "org1", syncVersion: 1, syncMode: "LIVE", enabledAt: new Date("2026-10-01T00:00:00Z"),
    unmatchedDonorPolicy: "HOLD_FOR_REVIEW", autoCommitBatches: false, pcoPaymentSourceId: "src1", defaultPcoFundId: "pdef", ...over.config,
  };
  db.connection = { churchId: "c1", status: "CONNECTED", pcoOrganizationId: "org1", canWriteGiving: true };
  db.settlements = [{ finixSettlementId: "ST1", churchId: "c1", settledAt: new Date("2026-10-11T00:00:00Z") }];
  db.mappings = [{ churchId: "c1", fundId: "f1", pcoFundId: "pf1" }];
  db.donors = Array.from({ length: n }, (_, i) => ({ id: `d${i + 1}`, churchId: "c1", name: `Donor ${i + 1}`, email: `d${i + 1}@x.com`, phone: null, anonymousPreference: false }));
  gifts.list = Array.from({ length: n }, (_, i) => gift(i + 1));
  for (let i = 1; i <= n; i++) linkStates.set(`d${i}`, { status: "LINKED", pcoPersonId: `person${i}` });
}

const records = () => db.donationRecords.filter((r) => r.syncRecordId === db.syncRecords[0]?.id);
const statuses = () => records().map((r) => r.status);
const writes = () => pco.calls.filter((c) => ["createBatch", "createDonation", "commit"].includes(c));

beforeEach(() => {
  db.config = null; db.connection = null; db.settlements = []; db.mappings = []; db.donors = []; db.syncRecords = []; db.donationRecords = []; db.attempts = []; db.links = [];
  pco.batches = []; pco.donations = []; pco.calls = []; pco.donationFaults = []; pco.batchFaults = []; pco.readFaults = []; pco.mutateAfterCreate = null; pco.batchStatusOnGet = null;
  linkStates.clear(); gifts.plan = null; readiness.value = { ready: true, reasons: [], notes: [] };
  notifyReview.mockClear(); notifyFailed.mockClear(); createPersonMock.mockReset();
  clock = 1; idSeq = 1; nowMs = T0.getTime(); barrier.size = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ─────────────────────────────────── tests ───────────────────────────────────

describe("scope and gating", () => {
  it("does nothing when sync is OFF or unconfigured", async () => {
    expect(await run()).toBe("OFF");
    seed(2, { config: { syncMode: "OFF" } });
    expect(await run()).toBe("OFF");
    expect(db.syncRecords).toHaveLength(0);
    expect(pco.calls).toHaveLength(0);
  });

  it("LIVE never touches a settlement from before the go-live watermark, and creates no record for it", async () => {
    seed(2);
    db.settlements[0].settledAt = new Date("2026-09-30T23:59:59Z");
    expect(await run()).toBe("OUT_OF_SCOPE");
    expect(db.syncRecords).toHaveLength(0);
    expect(pco.calls).toHaveLength(0);
  });

  it("LIVE with no watermark set is out of scope (it must be set deliberately)", async () => {
    seed(2, { config: { enabledAt: null } });
    expect(await run()).toBe("OUT_OF_SCOPE");
  });

  it("is BLOCKED, with no Planning Center calls, when setup isn't ready or the connection is down", async () => {
    seed(2);
    readiness.value = { ready: false, reasons: ["Choose a default fund."], notes: [] };
    expect(await run()).toBe("BLOCKED");
    expect(db.syncRecords[0].blockedReason).toBe("Choose a default fund.");
    expect(pco.calls).toHaveLength(0);
    readiness.value = { ready: true, reasons: [], notes: [] };
    db.connection!.status = "REAUTHENTICATION_REQUIRED";
    expect(await run()).toBe("BLOCKED");
    expect(pco.calls).toHaveLength(0);
  });

  it("waits (BLOCKED_AWAITING_FEES) when fees haven't landed, and retries on the next tick", async () => {
    seed(2);
    gifts.plan = { eligible: false, awaitingFees: true, reasons: [], safeMessage: "Fees pending.", gifts: [], settledAt: null };
    expect(await run()).toBe("BLOCKED_AWAITING_FEES");
    gifts.plan = null;
    expect(await run()).toBe("SYNCED");
  });
});

describe("dry run", () => {
  it("builds and stores what WOULD be sent and writes NOTHING to Planning Center", async () => {
    seed(3, { config: { syncMode: "DRY_RUN" } });
    expect(await run()).toBe("DRY_RUN");
    expect(writes()).toEqual([]);
    expect(pco.batches).toHaveLength(0);
    expect(records()).toHaveLength(3);
    for (const r of records()) {
      expect(r.status).toBe("PENDING");
      expect(r.payloadHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.payloadJson).toMatchObject({ pcoFundId: "pf1" });
    }
    expect(JSON.stringify(records()[0].payloadJson)).not.toContain("4242");
  });

  it("a stored dry run isn't recomputed every tick, but can be on request", async () => {
    seed(2, { config: { syncMode: "DRY_RUN" } });
    await run();
    expect(await run()).toBe("ALREADY_DONE");
    expect(await run({ recomputeDryRun: true })).toBe("DRY_RUN");
  });

  it("going LIVE afterwards promotes the dry run and sends each gift exactly once", async () => {
    seed(2, { config: { syncMode: "DRY_RUN" } });
    await run();
    db.config!.syncMode = "LIVE";
    expect(await run()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(2);
    expect(db.syncRecords).toHaveLength(1);
  });

  it("shows held gifts in the preview (unmatched donor under the HOLD policy)", async () => {
    seed(2, { config: { syncMode: "DRY_RUN" } });
    linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    await run();
    expect(statuses()).toEqual(["PENDING", "HELD"]);
  });
});

describe("live happy path", () => {
  it("creates one batch named after the deposit, one donation per gift, verifies, and finishes SYNCED", async () => {
    seed(3);
    expect(await run()).toBe("SYNCED");
    expect(pco.batches).toEqual([{ id: "b1", description: "WGC settlement ST1 · 2026-10-11", status: "in_progress" }]);
    expect(pco.donations).toHaveLength(3);
    expect(pco.donations.map((d) => d.amountCents)).toEqual([1000, 2000, 3000]);
    expect(pco.donations.map((d) => d.personId)).toEqual(["person1", "person2", "person3"]);
    expect(pco.donations.every((d) => d.paymentSourceId === "src1")).toBe(true);
    expect(statuses()).toEqual(["CREATED", "CREATED", "CREATED"]);
    expect(db.syncRecords[0]).toMatchObject({ status: "SYNCED", pcoBatchId: "b1", commitStatus: "NOT_COMMITTED" });
    expect(db.attempts.at(-1)).toMatchObject({ outcome: "SYNCED", createdCount: 3 });
  });

  it("does NOT commit unless the church asked for auto-commit", async () => {
    seed(2);
    await run();
    expect(pco.calls).not.toContain("commit");
    expect(pco.batches[0].status).toBe("in_progress");
  });

  it("commits a verified batch when auto-commit is on", async () => {
    seed(2, { config: { autoCommitBatches: true } });
    expect(await run()).toBe("SYNCED");
    expect(pco.calls.filter((c) => c === "commit")).toHaveLength(1);
    expect(db.syncRecords[0].commitStatus).toBe("COMMITTED");
  });

  it("running it again changes nothing: no second batch, no second donation", async () => {
    seed(3);
    await run();
    const callsBefore = pco.calls.length;
    expect(await run()).toBe("ALREADY_DONE");
    expect(pco.calls.length).toBe(callsBefore);
    expect(pco.donations).toHaveLength(3);
    expect(pco.batches).toHaveLength(1);
  });

  it("maps the fund through the mapping, falling back to the default fund", async () => {
    seed(2);
    gifts.list[1].fundId = "unmapped";
    await run();
    const attrs = records().map((r) => r.pcoFundId);
    expect(attrs).toEqual(["pf1", "pdef"]);
  });

  it("an all-skipped settlement is SYNCED without ever creating a batch", async () => {
    seed(2);
    gifts.list = [skippedGift(1), skippedGift(2, "DONOR_COVERED_FEE")];
    expect(await run()).toBe("SYNCED");
    expect(pco.calls).toEqual([]);
    expect(statuses()).toEqual(["SKIPPED", "SKIPPED"]);
    expect(records()[1].skippedReason).toBe("DONOR_COVERED_FEE");
  });

  it("skipped gifts are never sent, but the rest are", async () => {
    seed(3);
    gifts.list[1] = skippedGift(2);
    await run();
    expect(pco.donations.map((d) => d.amountCents)).toEqual([1000, 3000]);
  });

  it("a pending gift that is refunded between runs becomes SKIPPED and is never sent", async () => {
    seed(2, { config: { syncMode: "DRY_RUN" } });
    await run();
    db.config!.syncMode = "LIVE";
    gifts.list[0] = skippedGift(1, "REFUNDED");
    await run();
    expect(pco.donations).toHaveLength(1);
    expect(records()[0]).toMatchObject({ status: "SKIPPED", skippedReason: "REFUNDED" });
  });
});

describe("one payment, one donation — ever", () => {
  it("a payment already recorded under ANOTHER sync record is never sent again", async () => {
    seed(2);
    db.donationRecords.push({ id: "old", syncRecordId: "some-other-sync-record", churchId: "c1", paymentId: "pay1", status: "CREATED", pcoDonationId: "pd-old", amountCents: 1000 });
    await run();
    expect(pco.donations.map((d) => d.amountCents)).toEqual([2000]);
    expect(db.donationRecords.filter((r) => r.paymentId === "pay1")).toHaveLength(1);
  });

  it("two workers that BOTH read the record as claimable and reach the claim together: the claim itself lets exactly one through", async () => {
    seed(3);
    barrier.size = 2;
    barrier.arrived = 0;
    barrier.gate = new Promise<void>((resolve) => { barrier.release = resolve; });
    const results = await Promise.all([run(), run()]);
    barrier.size = 0;
    expect(results.sort()).toEqual(["CONTENDED", "SYNCED"]);
    expect(pco.donations).toHaveLength(3);
    expect(pco.batches).toHaveLength(1);
  });

  it("two workers on the same settlement: one works, the other backs off, nothing is duplicated", async () => {
    seed(3);
    const results = await Promise.all([run(), run()]);
    expect(results.filter((r) => r === "SYNCED")).toHaveLength(1);
    expect(results.filter((r) => r === "CONTENDED")).toHaveLength(1);
    expect(pco.donations).toHaveLength(3);
    expect(pco.batches).toHaveLength(1);
  });

  it("a live worker's fresh heartbeat is respected (CONTENDED), a dead worker's is recovered", async () => {
    seed(2);
    await run(); // creates + completes
    db.syncRecords[0].status = "PROCESSING";
    db.syncRecords[0].lastAttemptAt = new Date(nowMs - 1000);
    expect(await run()).toBe("CONTENDED");
    advance(STALE_PROCESSING_MS + 1000);
    expect(["SYNCED", "ALREADY_DONE"]).toContain(await run());
    expect(pco.donations).toHaveLength(2);
  });
});

describe("ambiguous donation POST — resolved by reading, never by re-sending", () => {
  it("timed out AFTER Planning Center created it: the donation is adopted, not duplicated", async () => {
    seed(3);
    pco.donationFaults = ["timeout-after-create"];
    const first = await run();
    expect(first).toBe("SYNCED"); // found by reading inside the same run, then carried on
    expect(pco.donations).toHaveLength(3);
    expect(new Set(pco.donations.map((d) => d.amountCents)).size).toBe(3);
    expect(statuses()).toEqual(["CREATED", "CREATED", "CREATED"]);
    expect(records().every((r) => r.pcoDonationId)).toBe(true);
  });

  it("a 5xx that actually created the donation is handled the same way", async () => {
    seed(2);
    pco.donationFaults = ["500-after-create"];
    await run();
    await run();
    expect(pco.donations).toHaveLength(2);
  });

  it("timed out BEFORE Planning Center saw it: NOT resent inside the grace period; resent exactly once after proof", async () => {
    seed(2);
    pco.donationFaults = ["timeout-before-create"];
    expect(await run()).toBe("RETRY_SCHEDULED");
    expect(pco.donations).toHaveLength(0);
    expect(statuses()).toEqual(["SENDING", "PENDING"]);

    // Too early: not due, and nothing is sent.
    advance(30_000);
    expect(await run()).toBe("NOT_DUE");
    expect(pco.donations).toHaveLength(0);

    // After the grace period it is proven absent and sent once.
    advance(RECONCILE_GRACE_MS);
    expect(await run()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(2);
    expect(statuses()).toEqual(["CREATED", "CREATED"]);
  });

  it("a donation that lands late (after our timeout) is found, never duplicated", async () => {
    seed(1);
    pco.donationFaults = ["timeout-before-create"];
    expect(await run()).toBe("RETRY_SCHEDULED");
    // The "lost" request completes on Planning Center's side after we gave up on it.
    pco.donations.push({ id: "pd-late", batchId: "b1", amountCents: 1000, receivedOn: "2026-10-10", personId: "person1", paymentSourceId: "src1", feeCents: -50 });
    advance(RECONCILE_GRACE_MS + 1000);
    expect(await run()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(1);
    expect(records()[0]).toMatchObject({ status: "CREATED", pcoDonationId: "pd-late" });
  });

  it("an identical-looking donation we can't attribute (someone added one by hand too) goes to a human", async () => {
    seed(1);
    pco.donationFaults = ["timeout-before-create"];
    await run();
    pco.donations.push(
      { id: "pd-a", batchId: "b1", amountCents: 1000, receivedOn: "2026-10-10", personId: "person1", paymentSourceId: "src1", feeCents: 0 },
      { id: "pd-b", batchId: "b1", amountCents: 1000, receivedOn: "2026-10-10", personId: "person1", paymentSourceId: "src1", feeCents: 0 }
    );
    advance(RECONCILE_GRACE_MS + 1000);
    expect(await run()).toBe("NEEDS_REVIEW");
    expect(pco.donations).toHaveLength(2); // nothing added
    expect(notifyReview).toHaveBeenCalledTimes(1);
  });

  it("gives up and asks a human if Planning Center never lets us confirm", async () => {
    seed(1);
    pco.donationFaults = ["timeout-before-create"];
    expect(await run()).toBe("RETRY_SCHEDULED");
    // Pretend four earlier unconfirmed attempts already happened.
    db.syncRecords[0].attemptCount = 4;
    advance(RECONCILE_GRACE_MS + 1000);
    pco.donationFaults = ["timeout-before-create"];
    expect(await run()).toBe("NEEDS_REVIEW");
    expect(pco.donations).toHaveLength(0);
    expect(notifyReview).toHaveBeenCalledTimes(1);
  });
});

describe("crash recovery", () => {
  it("a worker that died after Planning Center created a donation but before we recorded it: adopted on recovery", async () => {
    seed(2);
    await run();
    // Rewind to the moment of the crash: pay2 is SENDING, the batch has its donation, the sync record is mid-PROCESSING.
    const rec2 = db.donationRecords.find((r) => r.paymentId === "pay2")!;
    Object.assign(rec2, { status: "SENDING", pcoDonationId: null, sendingStartedAt: new Date(nowMs - 3600_000) });
    Object.assign(db.syncRecords[0], { status: "PROCESSING", lastAttemptAt: new Date(nowMs - 3600_000), commitStatus: "NOT_COMMITTED" });
    expect(await run()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(2);
    expect(rec2.status).toBe("CREATED");
    expect(rec2.pcoDonationId).toBe("pd2");
  });

  it("a crash after the batch was created but before its id was saved: the batch is FOUND, not recreated", async () => {
    seed(2);
    pco.batches.push({ id: "b-orphan", description: "WGC settlement ST1 · 2026-10-11", status: "in_progress" });
    await run();
    expect(pco.batches).toHaveLength(1);
    expect(pco.calls).not.toContain("createBatch");
    expect(db.syncRecords[0].pcoBatchId).toBe("b-orphan");
  });
});

describe("ambiguous batch create", () => {
  it("timed out after creating: found by description on the same run, no second batch", async () => {
    seed(2);
    pco.batchFaults = ["timeout-after-create"];
    expect(await run()).toBe("SYNCED");
    expect(pco.batches).toHaveLength(1);
    expect(pco.calls.filter((c) => c === "createBatch")).toHaveLength(1);
  });

  it("timed out before creating: waits out the grace period, then creates once", async () => {
    seed(2);
    pco.batchFaults = ["timeout-before-create"];
    expect(await run()).toBe("RETRY_SCHEDULED");
    expect(pco.batches).toHaveLength(0);
    expect(await run()).toBe("NOT_DUE");
    advance(RECONCILE_GRACE_MS + 1000);
    expect(await run()).toBe("SYNCED");
    expect(pco.batches).toHaveLength(1);
  });
});

describe("definite failures", () => {
  it("a 422 on one gift fails THAT gift only; it is never retried and the rest are still sent", async () => {
    seed(3);
    pco.donationFaults = ["422"];
    expect(await run()).toBe("FAILED");
    expect(statuses()).toEqual(["FAILED", "CREATED", "CREATED"]);
    expect(pco.donations).toHaveLength(2);
    expect(notifyFailed).toHaveBeenCalledTimes(1);
    expect(await run()).toBe("FAILED"); // terminal until a human retries
    expect(pco.calls.filter((c) => c === "createDonation")).toHaveLength(3);
  });

  it("a 403 stops the run, puts the gift back untouched, and records that write access is gone", async () => {
    seed(2);
    pco.donationFaults = ["403"];
    expect(await run()).toBe("FAILED");
    expect(db.connection!.canWriteGiving).toBe(false);
    expect(statuses()).toEqual(["PENDING", "PENDING"]);
    expect(pco.donations).toHaveLength(0);
  });

  it("a 401 is a reconnect problem, not a failure: BLOCKED and the gift goes back to PENDING", async () => {
    seed(2);
    pco.donationFaults = ["401"];
    expect(await run()).toBe("BLOCKED");
    expect(statuses()).toEqual(["PENDING", "PENDING"]);
    expect(db.syncRecords[0].blockedReason).toMatch(/reconnected/);
  });

  it("an outage while looking up the batch is retried with backoff, then gives up for good", async () => {
    seed(1);
    for (let i = 0; i < 6; i++) {
      pco.readFaults = ["503"];
      const outcome = await run();
      if (outcome === "FAILED") break;
      expect(outcome).toBe("RETRY_SCHEDULED");
      advance(24 * 3600_000);
    }
    expect(db.syncRecords[0].status).toBe("FAILED");
    expect(notifyFailed).toHaveBeenCalledTimes(1);
    expect(pco.donations).toHaveLength(0);
    expect(pco.calls).not.toContain("createBatch");
  });

  it("if the batch create can never be confirmed, a person is asked to check — not a blind retry", async () => {
    seed(1);
    let outcome = "";
    for (let i = 0; i < 6 && outcome !== "NEEDS_REVIEW"; i++) {
      pco.batchFaults = ["timeout-before-create"];
      if (db.syncRecords[0]) db.syncRecords[0].nextAttemptAt = null;
      outcome = await run();
    }
    expect(outcome).toBe("NEEDS_REVIEW");
    expect(notifyReview).toHaveBeenCalledTimes(1);
  });

  it("never exposes a raw error to the church", async () => {
    seed(1);
    pco.readFaults = ["503"];
    await run();
    const stored = JSON.stringify(db.syncRecords[0]);
    expect(stored).not.toMatch(/ECONN|stack|at Object/);
  });
});

describe("matching donors to people", () => {
  it("HOLD_FOR_REVIEW (default): the unmatched gift waits, the rest are sent, the settlement is PARTIAL", async () => {
    seed(3);
    linkStates.set("d2", { status: "NEEDS_REVIEW", pcoPersonId: null });
    expect(await run()).toBe("PARTIAL");
    expect(statuses()).toEqual(["CREATED", "HELD", "CREATED"]);
    expect(records()[1].lastErrorCode).toBe("PERSON_NEEDS_REVIEW");
    expect(pco.donations).toHaveLength(2);
  });

  it("once the church links the donor, a later run tops the SAME batch up — no second batch", async () => {
    seed(3);
    linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    await run();
    linkStates.set("d2", { status: "LINKED", pcoPersonId: "person2" });
    advance(2 * 3600_000); // past the PARTIAL re-check interval
    expect(await run()).toBe("SYNCED");
    expect(pco.batches).toHaveLength(1);
    expect(pco.donations).toHaveLength(3);
    expect(statuses()).toEqual(["CREATED", "CREATED", "CREATED"]);
  });

  it("a PARTIAL settlement isn't hammered every tick", async () => {
    seed(2);
    linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    await run();
    advance(60_000);
    expect(await run()).toBe("NOT_DUE");
  });

  it("ANONYMOUS policy sends the unmatched gift with no person", async () => {
    seed(2, { config: { unmatchedDonorPolicy: "ANONYMOUS" } });
    linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    expect(await run()).toBe("SYNCED");
    expect(pco.donations.map((d) => d.personId)).toEqual(["person1", null]);
  });

  it("a donor who asked to be anonymous, or an anonymous gift, NEVER has a person attached — even if linked", async () => {
    seed(3);
    db.donors[0].anonymousPreference = true;
    gifts.list[1].isAnonymous = true;
    await run();
    expect(pco.donations.map((d) => d.personId)).toEqual([null, null, "person3"]);
  });

  it("a gift with no donor on record is sent anonymously", async () => {
    seed(1);
    gifts.list[0].donorId = null;
    await run();
    expect(pco.donations[0].personId).toBeNull();
  });

  it("CREATE_PERSON creates the person once, links them, and uses them", async () => {
    seed(2, { config: { unmatchedDonorPolicy: "CREATE_PERSON" } });
    linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    createPersonMock.mockResolvedValue({ id: "newp", contactDetailsFailed: false });
    expect(await run()).toBe("SYNCED");
    expect(createPersonMock).toHaveBeenCalledTimes(1);
    expect(createPersonMock.mock.calls[0][1]).toMatchObject({ firstName: "Donor", lastName: "2", email: "d2@x.com" });
    expect(pco.donations.map((d) => d.personId)).toEqual(["person1", "newp"]);
    expect(db.links[0]).toMatchObject({ donorId: "d2", pcoPersonId: "newp", matchMethod: "CREATED" });
  });

  it("CREATE_PERSON never creates when several people could match, and never in a dry run", async () => {
    seed(1, { config: { unmatchedDonorPolicy: "CREATE_PERSON" } });
    linkStates.set("d1", { status: "NEEDS_REVIEW", pcoPersonId: null });
    expect(await run()).toBe("PARTIAL");
    expect(createPersonMock).not.toHaveBeenCalled();

    db.syncRecords = []; db.donationRecords = [];
    db.config!.syncMode = "DRY_RUN";
    linkStates.set("d1", { status: "NO_MATCH", pcoPersonId: null });
    await run();
    expect(createPersonMock).not.toHaveBeenCalled();
    expect(records()[0].payloadJson).toMatchObject({ wouldCreatePerson: true });
  });

  it("if creating a person can't be confirmed, the gift is held and the person is re-looked-up, never created twice", async () => {
    seed(1, { config: { unmatchedDonorPolicy: "CREATE_PERSON" } });
    linkStates.set("d1", { status: "NO_MATCH", pcoPersonId: null });
    db.links.push({ churchId: "c1", donorId: "d1", status: "NO_MATCH", lastCheckedAt: new Date() });
    createPersonMock.mockRejectedValue(new Error("timeout"));
    expect(await run()).toBe("PARTIAL");
    expect(records()[0]).toMatchObject({ status: "HELD", lastErrorCode: "PERSON_CREATE_UNCERTAIN" });
    expect(db.links[0].lastCheckedAt.getTime()).toBe(0); // forces a fresh lookup next time
    expect(createPersonMock).toHaveBeenCalledTimes(1);
  });

  it("CREATE_PERSON needs a first and last name", async () => {
    seed(1, { config: { unmatchedDonorPolicy: "CREATE_PERSON" } });
    db.donors[0].name = "Cher";
    linkStates.set("d1", { status: "NO_MATCH", pcoPersonId: null });
    await run();
    expect(createPersonMock).not.toHaveBeenCalled();
    expect(records()[0].lastErrorCode).toBe("NO_NAME");
  });
});

describe("throughput", () => {
  it("stops cleanly at the time budget (IN_PROGRESS) and the next run continues with only what's left", async () => {
    seed(5);
    let calls = 0;
    const ticking = () => new Date(nowMs + calls++ * 100);
    const first = await processSettlementSync("c1", "ST1", { client, now: ticking, timeBudgetMs: 250 });
    expect(first).toBe("IN_PROGRESS");
    const sentFirst = pco.donations.length;
    expect(sentFirst).toBeGreaterThan(0);
    expect(sentFirst).toBeLessThan(5);

    expect(await run()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(5);
    expect(pco.batches).toHaveLength(1);
    expect(new Set(records().map((r) => r.paymentId)).size).toBe(5);
  });
});

describe("verification and commit safety", () => {
  it("a gift whose amount differs in Planning Center → NEEDS_REVIEW, and NOTHING is committed", async () => {
    seed(2, { config: { autoCommitBatches: true } });
    pco.mutateAfterCreate = (d) => { if (d.amountCents === 2000) d.amountCents = 2001; };
    expect(await run()).toBe("NEEDS_REVIEW");
    expect(pco.calls).not.toContain("commit");
    expect(notifyReview).toHaveBeenCalledTimes(1);
    expect(await run()).toBe("NEEDS_REVIEW");
    expect(notifyReview).toHaveBeenCalledTimes(1); // announced once, not every tick
  });

  it("a gift that vanished from the batch → NEEDS_REVIEW, nothing committed", async () => {
    seed(2, { config: { autoCommitBatches: true } });
    pco.mutateAfterCreate = (d) => { if (d.amountCents === 1000) pco.donations.splice(pco.donations.indexOf(d), 1); };
    expect(await run()).toBe("NEEDS_REVIEW");
    expect(pco.calls).not.toContain("commit");
  });

  it("gifts someone added by hand to OUR batch are not ours to commit: SYNCED, but left uncommitted", async () => {
    seed(2, { config: { autoCommitBatches: true } });
    pco.batches.push({ id: "b1", description: "WGC settlement ST1 · 2026-10-11", status: "in_progress" });
    pco.donations.push({ id: "manual", batchId: "b1", amountCents: 777, receivedOn: "2026-10-09", personId: null, paymentSourceId: "other", feeCents: 0 });
    expect(await run()).toBe("SYNCED");
    expect(pco.calls).not.toContain("commit");
    expect(db.syncRecords[0].commitStatus).toBe("NOT_COMMITTED");
  });

  it("a commit that is still settling is polled until it lands", async () => {
    seed(2, { config: { autoCommitBatches: true } });
    pco.batchStatusOnGet = "updating";
    expect(await run()).toBe("SYNCED");
    expect(db.syncRecords[0].commitStatus).toBe("COMMITTING");
    advance(10 * 60_000);
    pco.batchStatusOnGet = "committed";
    const callsBefore = pco.calls.filter((c) => c === "commit").length;
    expect(await run()).toBe("SYNCED");
    expect(db.syncRecords[0].commitStatus).toBe("COMMITTED");
    expect(pco.calls.filter((c) => c === "commit").length).toBe(callsBefore); // never committed twice
  });
});

describe("classifyWriteError", () => {
  const e = (status: number) => new PlanningCenterApiError({ category: "UNKNOWN_ERROR", retryable: false, safeMessage: "x" }, status);
  it("only responses that PROVE nothing was created count as rejections", () => {
    expect(classifyWriteError(e(422))).toBe("REJECTED");
    expect(classifyWriteError(e(400))).toBe("REJECTED");
    expect(classifyWriteError(e(404))).toBe("NOT_FOUND");
    expect(classifyWriteError(e(403))).toBe("DENIED");
    expect(classifyWriteError(e(401))).toBe("AUTH");
  });
  it("timeouts, network errors, 5xx, 429, 408 and malformed successes are all AMBIGUOUS", () => {
    for (const s of [0, 500, 502, 503, 429, 408]) expect(classifyWriteError(e(s))).toBe("AMBIGUOUS");
    expect(classifyWriteError(new Error("Planning Center did not return the created donation."))).toBe("AMBIGUOUS");
    expect(classifyWriteError("weird")).toBe("AMBIGUOUS");
  });
});


// ───────────────────────── "as soon as it's paid": one batch per church per day ─────────────────────────

describe("day batches (send as soon as it's paid)", () => {
  const runDay = (opts: Record<string, any> = {}) => processDaySync("c1", "2026-10-14", { client, now, ...opts });
  const dayRecords = () => db.syncRecords.filter((r) => r.settlementId === "day:2026-10-14");

  beforeEach(() => {
    seed(2, { config: { sendTiming: "ON_PAYMENT", enabledAt: new Date("2026-10-14T00:00:00Z") } });
    nowMs = new Date("2026-10-14T18:00:00Z").getTime();
  });

  it("sends the day's gifts into ONE batch named for the day", async () => {
    expect(await runDay()).toBe("SYNCED");
    expect(pco.batches).toEqual([{ id: "b1", description: "WGC gifts · 2026-10-14", status: "in_progress" }]);
    expect(pco.donations).toHaveLength(2);
    expect(dayRecords()).toHaveLength(1);
  });

  it("a gift paid LATER the same day goes into the SAME batch, and nothing already sent is sent again", async () => {
    await runDay();
    expect(await runDay()).toBe("ALREADY_DONE"); // nothing new: no Planning Center calls at all
    const callsBefore = pco.calls.length;
    gifts.list.push(gift(3));
    db.donors.push({ id: "d3", churchId: "c1", name: "Donor 3", email: "d3@x.com", phone: null, anonymousPreference: false });
    linkStates.set("d3", { status: "LINKED", pcoPersonId: "person3" });
    expect(await runDay()).toBe("SYNCED");
    expect(pco.batches).toHaveLength(1);
    expect(pco.donations.map((d) => d.amountCents)).toEqual([1000, 2000, 3000]);
    expect(pco.calls.slice(callsBefore).filter((c) => c === "createDonation")).toHaveLength(1);
    expect(pco.calls.slice(callsBefore)).not.toContain("createBatch");
  });

  it("a day with nothing to send creates no record and calls nothing", async () => {
    gifts.list = [];
    expect(await runDay()).toBe("ALREADY_DONE");
    expect(db.syncRecords).toHaveLength(0);
    expect(pco.calls).toEqual([]);
  });

  it("each church chooses ONE timing: the other path does nothing", async () => {
    expect(await processSettlementSync("c1", "ST1", { client, now })).toBe("OFF");
    db.config!.sendTiming = "ON_SETTLEMENT";
    expect(await runDay()).toBe("OFF");
    expect(pco.calls).toEqual([]);
  });

  it("never touches a day that ended before the go-live moment", async () => {
    db.config!.enabledAt = new Date("2026-10-15T09:00:00Z");
    expect(await runDay()).toBe("OUT_OF_SCOPE");
    expect(db.syncRecords).toHaveLength(0);
  });

  it("two payments triggering the same day at once: one works, the other backs off, nothing is duplicated", async () => {
    gifts.list = [gift(1)];
    await runDay(); // the day's batch exists and is SYNCED; then two more gifts land at the same moment
    gifts.list = [gift(1), gift(2), gift(3)];
    db.donors.push({ id: "d3", churchId: "c1", name: "Donor 3", email: "d3@x.com", phone: null, anonymousPreference: false });
    linkStates.set("d3", { status: "LINKED", pcoPersonId: "person3" });
    barrier.size = 2; // force both workers to reach the claim together
    barrier.arrived = 0;
    barrier.gate = new Promise<void>((resolve) => { barrier.release = resolve; });
    const results = await Promise.all([runDay(), runDay()]);
    barrier.size = 0;
    expect(results.sort()).toEqual(["CONTENDED", "SYNCED"]);
    expect(pco.donations).toHaveLength(3);
    expect(pco.batches).toHaveLength(1);
    expect(new Set(records().map((r) => r.paymentId)).size).toBe(3);
  });

  it("ONE flagged gift does not stop the rest of the day, and a later gift still goes out", async () => {
    pco.donationFaults = ["422"];
    expect(await runDay()).toBe("PARTIAL"); // not FAILED: the day keeps working
    expect(statuses()).toEqual(["FAILED", "CREATED"]);
    expect(db.syncRecords[0].lastErrorMessage).toMatch(/rejected|attention/i);
    expect(notifyReview).toHaveBeenCalledTimes(1);

    gifts.list.push(gift(3));
    db.donors.push({ id: "d3", churchId: "c1", name: "Donor 3", email: "d3@x.com", phone: null, anonymousPreference: false });
    linkStates.set("d3", { status: "LINKED", pcoPersonId: "person3" });
    expect(await runDay()).toBe("PARTIAL");
    expect(statuses()).toEqual(["FAILED", "CREATED", "CREATED"]);
    expect(pco.donations).toHaveLength(2);
    expect(notifyReview).toHaveBeenCalledTimes(1); // told once, not on every gift
  });

  it("a stuck unknown outcome still stops being resent: the same read-before-resend rule applies to day batches", async () => {
    pco.donationFaults = ["timeout-before-create"];
    expect(await runDay()).toBe("RETRY_SCHEDULED");
    expect(pco.donations).toHaveLength(0);
    advance(RECONCILE_GRACE_MS + 1000);
    expect(await runDay()).toBe("SYNCED");
    expect(pco.donations).toHaveLength(2);
  });

  it("uses the payment's CURRENT donor, so two donors merged into one are treated as one", async () => {
    // pay2 now belongs to donor d1 (after a merge), who is linked and NOT anonymous; d2 would have been anonymous.
    db.donors[1].anonymousPreference = true;
    gifts.list[1] = gift(2, { donorId: "d1" });
    await runDay();
    expect(pco.donations.map((d) => d.personId)).toEqual(["person1", "person1"]);
  });

  describe("ATTACH_LATER: send now, attach the person once the donor is matched", () => {
    beforeEach(() => {
      db.config!.unmatchedDonorPolicy = "ATTACH_LATER";
      linkStates.set("d2", { status: "NO_MATCH", pcoPersonId: null });
    });

    it("an unmatched donor's gift is NOT held: it goes out now with no person, and is marked to attach later", async () => {
      expect(await runDay()).toBe("SYNCED");
      expect(pco.donations.map((d) => d.personId)).toEqual(["person1", null]);
      expect(records().map((r) => r.attachPersonPending)).toEqual([false, true]);
    });

    it("several possible matches also go out now (the church picks the person afterwards)", async () => {
      linkStates.set("d2", { status: "NEEDS_REVIEW", pcoPersonId: null });
      expect(await runDay()).toBe("SYNCED");
      expect(statuses()).toEqual(["CREATED", "CREATED"]);
      expect(records()[1].attachPersonPending).toBe(true);
    });

    it("an anonymous donor is NOT marked to attach: they asked not to be named", async () => {
      db.donors[1].anonymousPreference = true;
      await runDay();
      expect(records()[1].attachPersonPending).toBe(false);
    });
  });
});
