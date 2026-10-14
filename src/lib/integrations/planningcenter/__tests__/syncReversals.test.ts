/* eslint-disable @typescript-eslint/no-explicit-any -- loose in-memory fakes */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, any>;
const db = { records: [] as Row[], payments: [] as Row[], syncRecords: [] as Row[] };
const match = (row: Row, where: Row) =>
  Object.entries(where).every(([k, v]: any) => (v && typeof v === "object" && "in" in v ? v.in.includes(row[k]) : v && typeof v === "object" && "not" in v ? row[k] !== v.not : row[k] === v));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    planningCenterDonationRecord: {
      findMany: async ({ where, take }: any) => db.records.filter((r) => match(r, where)).slice(0, take),
      update: async ({ where, data }: any) => Object.assign(db.records.find((r) => r.id === where.id)!, data),
    },
    payment: { findMany: async ({ where }: any) => db.payments.filter((p) => p.churchId === where.churchId && where.id.in.includes(p.id)) },
    planningCenterSyncRecord: { findFirst: async ({ where }: any) => db.syncRecords.find((r) => match(r, where)) ?? null },
  },
}));
vi.mock("../service", () => ({ getClientForChurch: async () => ({}) }));
// `effective` stands in for the refund/return lookup (Payment.status alone never shows a refund)
vi.mock("../giftOutcomes", () => ({ effectivePaymentStatuses: async (_c: string, payments: any[]) => new Map(payments.map((p) => [p.id, db.payments.find((x) => x.id === p.id)?.effective ?? p.status])) }));
// classifyWriteError is pure; take the real one without loading the whole engine's dependencies
vi.mock("../syncEngine", async () => {
  const { PlanningCenterApiError } = await import("../errors");
  return {
    classifyWriteError: (err: unknown) => {
      if (err instanceof PlanningCenterApiError) {
        if (err.status === 401) return "AUTH";
        if (err.status === 403) return "DENIED";
        if (err.status === 404) return "NOT_FOUND";
        if (err.status === 400 || err.status === 422) return "REJECTED";
      }
      return "AMBIGUOUS";
    },
  };
});

const api = { getDonation: vi.fn(), getBatch: vi.fn(), deleteDonation: vi.fn(), issueRefund: vi.fn(), markDonationFailed: vi.fn() };
vi.mock("../givingApi", () => ({
  getDonation: (...a: unknown[]) => api.getDonation(...a),
  getBatch: (...a: unknown[]) => api.getBatch(...a),
  deleteDonation: (...a: unknown[]) => api.deleteDonation(...a),
  issueRefund: (...a: unknown[]) => api.issueRefund(...a),
  markDonationFailed: (...a: unknown[]) => api.markDonationFailed(...a),
}));

import { PlanningCenterApiError } from "../errors";
import { reverseChangedGifts } from "../syncReversals";

const apiErr = (status: number) => new PlanningCenterApiError({ category: "UNKNOWN_ERROR", retryable: false, safeMessage: "x" }, status);
const NOW = new Date("2026-10-15T10:00:00Z");
const opts = { client: {} as any, now: () => NOW };

beforeEach(() => {
  Object.values(api).forEach((m) => m.mockReset());
  db.records = [{ id: "r1", churchId: "c1", paymentId: "p1", syncRecordId: "s1", status: "CREATED", pcoDonationId: "pd1", updatedAt: new Date(1) }];
  db.payments = [{ id: "p1", churchId: "c1", status: "REFUNDED" }];
  db.syncRecords = [{ id: "s1", churchId: "c1", pcoBatchId: "b1" }];
  api.getBatch.mockResolvedValue({ id: "b1", status: "committed" });
  // not yet reversed, then reversed after the action
  api.getDonation.mockResolvedValueOnce({ id: "pd1", refunded: false, paymentStatus: "succeeded" }).mockResolvedValue({ id: "pd1", refunded: true, paymentStatus: "succeeded" });
});

describe("reverseChangedGifts", () => {
  it("a refunded gift in a COMMITTED batch is refunded in Planning Center, confirmed by reading, and recorded", async () => {
    expect(await reverseChangedGifts("c1", opts)).toEqual({ reversed: 1, waiting: 0, flagged: 0 });
    expect(api.issueRefund).toHaveBeenCalledWith(expect.anything(), "pd1", "2026-10-15");
    expect(api.markDonationFailed).not.toHaveBeenCalled();
    expect(db.records[0]).toMatchObject({ status: "REVERSED", reversedAt: NOW, skippedReason: "REFUNDED" });
  });

  it("a gift that was REFUNDED is found even though its payment still says SUCCEEDED (refunds don't change the status)", async () => {
    db.payments = [{ id: "p1", churchId: "c1", status: "SUCCEEDED", effective: "REFUNDED" }];
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 1 });
    expect(api.issueRefund).toHaveBeenCalledTimes(1);
  });

  it("a gift in a batch NOT yet committed is simply removed from it", async () => {
    api.getBatch.mockResolvedValue({ id: "b1", status: "in_progress" });
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValueOnce({ id: "pd1", refunded: false }).mockResolvedValue(null);
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 1 });
    expect(api.deleteDonation).toHaveBeenCalledWith(expect.anything(), "pd1");
    expect(api.issueRefund).not.toHaveBeenCalled();
  });

  it("a returned bank payment or a failed payment is marked failed (not refunded), with a plain reason", async () => {
    for (const [status, reason] of [["RETURNED", "Returned by the bank"], ["FAILED", "The payment failed"]]) {
      db.records[0].status = "CREATED";
      db.payments[0].status = status;
      api.markDonationFailed.mockReset();
      api.getDonation.mockReset();
      api.getDonation.mockResolvedValueOnce({ id: "pd1", refunded: false, paymentStatus: "succeeded" }).mockResolvedValue({ id: "pd1", refunded: false, paymentStatus: "failed" });
      await reverseChangedGifts("c1", opts);
      expect(api.markDonationFailed).toHaveBeenCalledWith(expect.anything(), "pd1", reason);
      expect(api.issueRefund).not.toHaveBeenCalled();
      expect(db.records[0].status).toBe("REVERSED");
    }
  });

  it("does NOTHING if Planning Center already reflects it (re-checks first), so repeating is harmless", async () => {
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValue({ id: "pd1", refunded: true });
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 1 });
    expect(api.issueRefund).not.toHaveBeenCalled();
    expect(await reverseChangedGifts("c1", opts)).toEqual({ reversed: 0, waiting: 0, flagged: 0 }); // already REVERSED: not a candidate
  });

  it("a gift that is already gone from Planning Center is recorded as reversed", async () => {
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValue(null);
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 1 });
    expect(api.deleteDonation).not.toHaveBeenCalled();
  });

  it("a timeout is settled by READING: if it landed it's recorded, if not it waits and is not repeated in the same run", async () => {
    api.issueRefund.mockRejectedValue(apiErr(0));
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 1 }); // the read shows it landed

    db.records[0].status = "CREATED";
    api.issueRefund.mockClear();
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValue({ id: "pd1", refunded: false, paymentStatus: "succeeded" }); // never landed
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ reversed: 0, waiting: 1 });
    expect(api.issueRefund).toHaveBeenCalledTimes(1);
    expect(db.records[0].status).toBe("CREATED"); // tried again next time
  });

  it("a refund Planning Center refuses is flagged for a person, in plain words", async () => {
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValue({ id: "pd1", refunded: false, paymentStatus: "succeeded" });
    api.issueRefund.mockRejectedValue(apiErr(422));
    expect(await reverseChangedGifts("c1", opts)).toMatchObject({ flagged: 1 });
    expect(db.records[0]).toMatchObject({ status: "NEEDS_REVIEW" });
    expect(db.records[0].lastErrorMessage).toMatch(/Refund it in Planning Center/);
  });

  it("no permission stops the run with the error (so it's reported), not silently skipped", async () => {
    api.getDonation.mockReset();
    api.getDonation.mockResolvedValue({ id: "pd1", refunded: false });
    api.issueRefund.mockRejectedValue(apiErr(403));
    await expect(reverseChangedGifts("c1", opts)).rejects.toBeInstanceOf(PlanningCenterApiError);
  });

  it("leaves successful and PARTIALLY refunded gifts alone (partial refunds go on the 'changed after it was sent' list)", async () => {
    for (const status of ["SUCCEEDED", "PARTIALLY_REFUNDED", "PENDING"]) {
      db.payments[0].status = status;
      expect(await reverseChangedGifts("c1", opts)).toEqual({ reversed: 0, waiting: 0, flagged: 0 });
    }
    expect(api.getDonation).not.toHaveBeenCalled();
    expect(api.issueRefund).not.toHaveBeenCalled();
  });

  it("never touches another church's gifts, and can be limited to specific payments", async () => {
    db.records = [{ ...db.records[0], churchId: "c2" }, { ...db.records[0], id: "r2", paymentId: "p2" }];
    db.payments.push({ id: "p2", churchId: "c1", status: "REFUNDED" });
    expect(await reverseChangedGifts("c1", { ...opts, paymentIds: ["p1"] })).toEqual({ reversed: 0, waiting: 0, flagged: 0 });
    expect(await reverseChangedGifts("c1", { ...opts, paymentIds: ["p2"] })).toMatchObject({ reversed: 1 });
  });
});
