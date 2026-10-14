/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const refundFind = vi.fn();
const returnFind = vi.fn();
vi.mock("@/lib/prisma", () => ({
  prisma: { finixRefundOrReversal: { findMany: (a: any) => refundFind(a) }, bankReturn: { findMany: (a: any) => returnFind(a) } },
}));

import { effectivePaymentStatuses, effectiveStatus } from "../giftOutcomes";

const pay = (over: Record<string, any> = {}) => ({ id: "p1", status: "SUCCEEDED", amountCents: 25000, finixTransferId: "TR1", ...over });
const refund = (amountCents: number, state = "SUCCEEDED") => ({ amountCents, state });

describe("effectiveStatus", () => {
  it("a refund does NOT change Payment.status, so a fully refunded gift is still found to be REFUNDED", () => {
    expect(effectiveStatus(pay(), [refund(25000)], 0)).toBe("REFUNDED");
    expect(effectiveStatus(pay(), [refund(10000), refund(15000)], 0)).toBe("REFUNDED"); // two partial refunds that add up
  });

  it("a partial refund is PARTIALLY_REFUNDED; none is SUCCEEDED", () => {
    expect(effectiveStatus(pay(), [refund(5000)], 0)).toBe("PARTIALLY_REFUNDED");
    expect(effectiveStatus(pay(), [], 0)).toBe("SUCCEEDED");
  });

  it("a refund still in progress is REFUND_PENDING, and a failed refund doesn't count", () => {
    expect(effectiveStatus(pay(), [refund(25000, "PENDING")], 0)).toBe("REFUND_PENDING");
    expect(effectiveStatus(pay(), [refund(25000, "FAILED")], 0)).toBe("SUCCEEDED");
  });

  it("a full bank return is RETURNED; a partial one is PARTIALLY_REFUNDED", () => {
    expect(effectiveStatus(pay(), [], 25000)).toBe("RETURNED");
    expect(effectiveStatus(pay(), [], 5000)).toBe("PARTIALLY_REFUNDED");
  });

  it("statuses already on the payment (returned, failed, canceled, pending) are kept", () => {
    for (const status of ["RETURNED", "FAILED", "CANCELED", "PENDING"]) expect(effectiveStatus(pay({ status }), [refund(25000)], 0)).toBe(status);
  });

  it("an older row already stored as REFUNDED stays REFUNDED even without refund rows", () => {
    expect(effectiveStatus(pay({ status: "REFUNDED" }), [], 0)).toBe("REFUNDED");
  });
});

describe("effectivePaymentStatuses", () => {
  beforeEach(() => {
    refundFind.mockReset();
    returnFind.mockReset();
  });

  it("looks refunds up by transfer, scoped to the church, and maps each payment", async () => {
    refundFind.mockResolvedValue([{ finixOriginalTransferId: "TR1", amountCents: 25000, state: "SUCCEEDED" }]);
    returnFind.mockResolvedValue([{ originalTransferId: "TR3", amountCents: 25000 }]);
    const out = await effectivePaymentStatuses("c1", [pay(), pay({ id: "p2", finixTransferId: "TR2" }), pay({ id: "p3", finixTransferId: "TR3" }), pay({ id: "p4", finixTransferId: null })]);
    expect([...out.entries()]).toEqual([["p1", "REFUNDED"], ["p2", "SUCCEEDED"], ["p3", "RETURNED"], ["p4", "SUCCEEDED"]]);
    expect(refundFind.mock.calls[0][0].where).toEqual({ churchId: "c1", finixOriginalTransferId: { in: ["TR1", "TR2", "TR3"] } });
    expect(returnFind.mock.calls[0][0].where.churchId).toBe("c1");
  });

  it("makes no queries when no payment has a transfer", async () => {
    const out = await effectivePaymentStatuses("c1", [pay({ finixTransferId: null })]);
    expect(out.get("p1")).toBe("SUCCEEDED");
    expect(refundFind).not.toHaveBeenCalled();
  });
});
