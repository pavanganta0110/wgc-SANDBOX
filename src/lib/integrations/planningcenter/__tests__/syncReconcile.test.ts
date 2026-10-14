import { describe, it, expect } from "vitest";
import { RECONCILE_GRACE_MS, reconcileSending, type SendingRecord } from "../syncReconcile";
import type { PcoDonation } from "../givingApi";

const t0 = new Date("2026-10-13T12:00:00Z");
const early = new Date(t0.getTime() + 10_000); // inside the grace period
const late = new Date(t0.getTime() + RECONCILE_GRACE_MS + 1000);

const rec = (id: string, over: Partial<SendingRecord> = {}): SendingRecord => ({ id, pcoPersonId: "p1", amountCents: 5000, receivedOn: "2026-10-10", sendingStartedAt: t0, ...over });
const don = (id: string, over: Partial<PcoDonation> = {}): PcoDonation => ({ id, amountCents: 5000, receivedOn: "2026-10-10", personId: "p1", paymentSourceId: "s1", feeCents: 0, ...over });

describe("reconcileSending", () => {
  it("adopts a matching unrecorded donation: the write DID land", () => {
    expect(reconcileSending([rec("r1")], [don("d1")], early)).toEqual({ adopt: [{ recordId: "r1", pcoDonationId: "d1" }], notCreated: [], wait: [], undecidable: [] });
  });

  it("does NOT conclude 'not created' inside the grace period (the request may still complete on Planning Center's side)", () => {
    expect(reconcileSending([rec("r1")], [], early)).toEqual({ adopt: [], notCreated: [], wait: ["r1"], undecidable: [] });
  });

  it("concludes 'not created' only after the grace period AND finding nothing", () => {
    expect(reconcileSending([rec("r1")], [], late)).toEqual({ adopt: [], notCreated: ["r1"], wait: [], undecidable: [] });
  });

  it("a found donation is adopted even inside the grace period", () => {
    expect(reconcileSending([rec("r1")], [don("d1")], early).adopt).toHaveLength(1);
  });

  it("tolerates a one-day timezone shift in received_at, but not two", () => {
    expect(reconcileSending([rec("r1")], [don("d1", { receivedOn: "2026-10-09" })], early).adopt).toHaveLength(1);
    expect(reconcileSending([rec("r1")], [don("d1", { receivedOn: "2026-10-11" })], early).adopt).toHaveLength(1);
    expect(reconcileSending([rec("r1")], [don("d1", { receivedOn: "2026-10-12" })], late).notCreated).toEqual(["r1"]);
  });

  it("never matches a different person or amount", () => {
    expect(reconcileSending([rec("r1")], [don("d1", { personId: "other" })], late).notCreated).toEqual(["r1"]);
    expect(reconcileSending([rec("r1")], [don("d1", { amountCents: 4999 })], late).notCreated).toEqual(["r1"]);
  });

  it("anonymous gifts match only anonymous donations", () => {
    expect(reconcileSending([rec("r1", { pcoPersonId: null })], [don("d1", { personId: null })], early).adopt).toHaveLength(1);
    expect(reconcileSending([rec("r1", { pcoPersonId: null })], [don("d1", { personId: "p1" })], late).notCreated).toEqual(["r1"]);
  });

  it("two identical gifts, both landed: each adopts its own donation, none shared", () => {
    const out = reconcileSending([rec("r1"), rec("r2", { sendingStartedAt: new Date(t0.getTime() + 1) })], [don("d1"), don("d2")], early);
    expect(out.adopt.map((a) => a.pcoDonationId).sort()).toEqual(["d1", "d2"]);
    expect(new Set(out.adopt.map((a) => a.recordId)).size).toBe(2);
  });

  it("two identical gifts, only one landed: adopt one, the other waits (then is proven not created)", () => {
    const records = [rec("r1"), rec("r2", { sendingStartedAt: new Date(t0.getTime() + 1) })];
    const soon = reconcileSending(records, [don("d1")], early);
    expect(soon.adopt).toHaveLength(1);
    expect(soon.wait).toHaveLength(1);
    expect(reconcileSending(records, [don("d1")], late).notCreated).toHaveLength(1);
  });

  it("MORE matching donations than we sent → a human must decide, never guess", () => {
    const out = reconcileSending([rec("r1")], [don("d1"), don("d2")], early);
    expect(out).toEqual({ adopt: [], notCreated: [], wait: [], undecidable: ["r1"] });
  });

  it("handles several independent groups in one call", () => {
    const out = reconcileSending([rec("r1"), rec("r2", { pcoPersonId: "p2", amountCents: 100 })], [don("d1")], late);
    expect(out.adopt).toEqual([{ recordId: "r1", pcoDonationId: "d1" }]);
    expect(out.notCreated).toEqual(["r2"]);
  });

  it("does nothing for nothing", () => {
    expect(reconcileSending([], [don("d1")], late)).toEqual({ adopt: [], notCreated: [], wait: [], undecidable: [] });
  });
});
