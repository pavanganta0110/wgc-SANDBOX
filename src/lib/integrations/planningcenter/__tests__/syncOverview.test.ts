/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fake of a few Prisma tables */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { config: null as Row | null, records: [] as Row[], donations: [] as Row[], attempts: [] as Row[], donors: [] as Row[], payments: [] as Row[], links: [] as Row[], connection: { status: "CONNECTED" } as Row | null };

const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : row[k] === v));
const take = <T,>(rows: T[], n?: number) => (n ? rows.slice(0, n) : rows);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterSyncConfig: { findUnique: async () => db.config },
    planningCenterSyncAttempt: { count: async ({ where }: any) => db.attempts.filter((a) => match(a, where)).length },
    planningCenterSyncRecord: { findMany: async ({ where, take: n }: any) => take(db.records.filter((r) => match(r, where)), n) },
    planningCenterDonationRecord: {
      findMany: async ({ where, take: n }: any) => take(db.donations.filter((d) => match(d, where)), n),
      count: async ({ where }: any) => db.donations.filter((d) => match(d, where)).length,
    },
    planningCenterPersonLink: {
      count: async ({ where }: any) => db.links.filter((l) => match(l, { churchId: where.churchId, status: where.status }) && (!where.profileSyncedAt || l.profileSyncedAt)).length,
      findFirst: async () => db.links.filter((l) => l.profileSyncedAt).sort((a, b) => b.profileSyncedAt - a.profileSyncedAt)[0] ?? null,
    },
    planningCenterConnection: { findUnique: async () => db.connection },
    donor: { findMany: async ({ where }: any) => db.donors.filter((d) => match(d, where)) },
    payment: { findMany: async ({ where }: any) => db.payments.filter((p) => p.churchId === where.churchId && where.id.in.includes(p.id)) },
  },
}));
let platformOn = true;
vi.mock("../config", () => ({ isPlanningCenterSyncEnabled: () => platformOn }));
vi.mock("../giftOutcomes", () => ({ effectivePaymentStatuses: async (_c: string, payments: any[]) => new Map(payments.map((p) => [p.id, db.payments.find((x) => x.id === p.id)?.effective ?? p.status])) }));
vi.mock("../syncConfig", () => ({ computeStoredGivingReadiness: async () => ({ ready: false, reasons: ["Choose a default fund."], notes: [] }) }));

vi.mock("../giftActivity", () => ({ getGiftActivity: async () => ({ days: 30, gifts: 84, cardGifts: 70, bankGifts: 14, estimatedPlanningCenterFeeCents: 12345 }) }));

import { getSyncOverview } from "../syncOverview";

const don = (id: string, status: string, over: Row = {}) => ({ id, syncRecordId: "r1", churchId: "c1", paymentId: `pay-${id}`, donorId: null, status, amountCents: 1000, receivedOn: "2026-10-10", skippedReason: null, lastErrorMessage: null, pcoDonationId: null, createdAt: new Date(), updatedAt: new Date(), ...over });

beforeEach(() => {
  platformOn = true;
  db.config = { syncMode: "LIVE", unmatchedDonorPolicy: "ANONYMOUS", autoCommitBatches: true, enabledAt: new Date("2026-10-01T00:00:00Z"), syncVersion: 2 };
  db.records = [
    { id: "r1", churchId: "c1", syncVersion: 2, settlementId: "ST1", status: "PARTIAL", blockedReason: null, lastErrorMessage: null, pcoBatchId: "b1", commitStatus: "NOT_COMMITTED", updatedAt: new Date("2026-10-12T00:00:00Z") },
    { id: "old", churchId: "c1", syncVersion: 1, settlementId: "STOLD", status: "SYNCED", blockedReason: null, lastErrorMessage: null, pcoBatchId: "bx", commitStatus: "N_A", updatedAt: new Date() },
    { id: "other", churchId: "c2", syncVersion: 2, settlementId: "STX", status: "SYNCED", blockedReason: null, lastErrorMessage: null, pcoBatchId: null, commitStatus: "N_A", updatedAt: new Date() },
  ];
  db.donations = [];
  db.attempts = [];
  db.donors = [{ id: "dn1", churchId: "c1", name: "Pat Smith" }];
  db.payments = [];
});

describe("getSyncOverview: people only", () => {
  beforeEach(() => {
    db.links = [
      { churchId: "c1", status: "LINKED", profileSyncedAt: new Date("2026-10-12T10:00:00Z") },
      { churchId: "c1", status: "LINKED", profileSyncedAt: null },
      { churchId: "c1", status: "NO_MATCH", profileSyncedAt: null },
    ];
    db.config = { ...db.config, syncMode: "OFF", syncTarget: "PROFILE_FIELDS" };
  });

  it("is ready with just a working connection: no Giving setup is asked for", async () => {
    const o = await getSyncOverview("c1");
    expect(o.settings.syncTarget).toBe("PROFILE_FIELDS");
    expect(o.ready).toBe(true);
    expect(o.readinessReasons).toEqual([]);
  });

  it("is not ready when Planning Center isn't connected", async () => {
    db.connection = { status: "DISCONNECTED" };
    const o = await getSyncOverview("c1");
    expect(o.ready).toBe(false);
    expect(o.readinessReasons).toEqual(["Reconnect Planning Center first."]);
    db.connection = { status: "CONNECTED" };
  });

  it("counts matched people and how many already have the section", async () => {
    const o = await getSyncOverview("c1");
    expect(o.profile).toEqual({ linkedPeople: 2, updatedPeople: 1, lastUpdatedAt: "2026-10-12T10:00:00.000Z" });
  });

  it("includes the last 30 days of gifts and what Planning Center would have charged", async () => {
    expect((await getSyncOverview("c1")).activity).toEqual({ days: 30, gifts: 84, cardGifts: 70, bankGifts: 14, estimatedPlanningCenterFeeCents: 12345 });
  });

  it("a gifts church still asks for the Giving setup", async () => {
    db.config = { ...db.config, syncTarget: "GIFTS" };
    expect((await getSyncOverview("c1")).ready).toBe(false);
  });
});

describe("getSyncOverview", () => {
  it("reports settings, readiness and whether a preview has ever run", async () => {
    db.attempts = [{ churchId: "c1", outcome: "DRY_RUN" }];
    const o = await getSyncOverview("c1");
    expect(o).toMatchObject({ platformEnabled: true, ready: false, readinessReasons: ["Choose a default fund."], hasDryRun: true });
    expect(o.settings).toEqual({ syncMode: "LIVE", sendTiming: "ON_PAYMENT", syncTarget: "GIFTS", unmatchedDonorPolicy: "ANONYMOUS", autoCommitBatches: true, enabledAt: "2026-10-01T00:00:00.000Z" });
  });

  it("defaults to OFF for a church that never set anything up", async () => {
    db.config = null;
    expect((await getSyncOverview("c1")).settings).toMatchObject({ syncMode: "OFF", unmatchedDonorPolicy: "HOLD_FOR_REVIEW", autoCommitBatches: false });
  });

  it("shows only this church's records from the CURRENT sync generation, with per-status gift counts", async () => {
    db.donations = [don("a", "CREATED"), don("b", "CREATED"), don("c", "HELD", { donorId: "dn1" }), don("d", "SKIPPED", { skippedReason: "REFUNDED" })];
    const o = await getSyncOverview("c1");
    expect(o.records.map((r) => r.settlementId)).toEqual(["ST1"]);
    expect(o.records[0].counts).toMatchObject({ created: 2, held: 1, skipped: 1, needsReview: 0 });
  });

  it("lists held gifts with the donor's name and a plain-language reason", async () => {
    db.donations = [don("c", "HELD", { donorId: "dn1", skippedReason: "PERSON_NEEDS_REVIEW" })];
    const { held } = await getSyncOverview("c1");
    expect(held.total).toBe(1);
    expect(held.items[0]).toMatchObject({ donorName: "Pat Smith", reason: "PERSON_NEEDS_REVIEW" });
    expect(held.items[0].message).toMatch(/Several people/);
  });

  it("lists skipped gifts with the reason a church can understand", async () => {
    db.donations = [don("d", "SKIPPED", { skippedReason: "DONOR_COVERED_FEE" })];
    expect((await getSyncOverview("c1")).skipped.items[0].message).toMatch(/donor covered the processing fee/i);
  });

  it("lists gifts that need a decision, newest problems included", async () => {
    db.donations = [don("e", "NEEDS_REVIEW", { lastErrorMessage: "Check the batch." }), don("f", "FAILED", { lastErrorMessage: "Planning Center rejected this gift." })];
    const { needsReview } = await getSyncOverview("c1");
    expect(needsReview.map((n) => [n.status, n.message])).toEqual([["NEEDS_REVIEW", "Check the batch."], ["FAILED", "Planning Center rejected this gift."]]);
    expect(needsReview.every((n) => "code" in n)).toBe(true);
    expect(needsReview[0].settlementId).toBe("ST1");
  });

  it("flags a gift ALREADY in Planning Center whose payment was refunded, returned or failed afterwards", async () => {
    db.donations = [don("g", "CREATED", { pcoDonationId: "pd9" }), don("h", "CREATED"), don("i", "CREATED")];
    db.payments = [
      { id: "pay-g", churchId: "c1", status: "REFUNDED" },
      { id: "pay-h", churchId: "c1", status: "SUCCEEDED" },
      { id: "pay-i", churchId: "c2", status: "RETURNED" }, // another church's payment id must never leak in
    ];
    const { needsAttention } = await getSyncOverview("c1");
    expect(needsAttention).toHaveLength(1);
    expect(needsAttention[0]).toMatchObject({ paymentId: "pay-g", paymentStatus: "REFUNDED", pcoDonationId: "pd9", pcoBatchId: "b1" });
    expect(needsAttention[0].message).toMatch(/later refunded in WGC.*Update it in Planning Center/);
  });

  it("flags a gift that was refunded even though its payment still says SUCCEEDED (the real-world case)", async () => {
    db.donations = [don("g", "CREATED", { pcoDonationId: "pd9" })];
    db.payments = [{ id: "pay-g", churchId: "c1", status: "SUCCEEDED", effective: "REFUNDED" }];
    const { needsAttention } = await getSyncOverview("c1");
    expect(needsAttention).toHaveLength(1);
    expect(needsAttention[0].paymentStatus).toBe("REFUNDED");
  });

  it("reflects the platform switch", async () => {
    platformOn = false;
    expect((await getSyncOverview("c1")).platformEnabled).toBe(false);
  });
});
