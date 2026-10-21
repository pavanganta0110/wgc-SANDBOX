/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const settlementFind = vi.fn();
const transferFind = vi.fn();
const paymentFind = vi.fn();
const instrumentFind = vi.fn();
const recordFind = vi.fn();
const refundFind = vi.fn<(...args: unknown[]) => Promise<any[]>>(async () => []);
const returnFind = vi.fn<(...args: unknown[]) => Promise<any[]>>(async () => []);
vi.mock("@/lib/prisma", () => ({
  prisma: {
    finixSettlement: { findUnique: (a: any) => settlementFind(a) },
    finixTransfer: { findMany: (a: any) => transferFind(a) },
    payment: { findMany: (a: any) => paymentFind(a) },
    finixPaymentInstrumentSnapshot: { findMany: (a: any) => instrumentFind(a) },
    planningCenterDonationRecord: { findMany: (a: any) => recordFind(a) },
    finixRefundOrReversal: { findMany: (a: any) => refundFind(a) },
    bankReturn: { findMany: (a: any) => returnFind(a) },
  },
}));

import { buildSettlementPlan, classifyPayment, toCardSubtype, toPcoMethod } from "../giftPlan";
import { batchDescription, buildDonationPayload, resolveTargetFund, stableStringify } from "../giftPayload";

const payment = (over: Record<string, any> = {}) => ({
  id: "pay1", churchId: "c1", donorId: "d1", fundId: "f1", status: "SUCCEEDED", isAnonymous: false, amountCents: 5000,
  donationAmountCents: 5000, feeCoveredCents: 0, paymentMethodType: "PAYMENT_CARD", cardBrand: "VISA", actualFinixFeesCents: 175,
  goodsServicesProvided: false, finixPaymentInstrumentId: "pi1", createdAt: new Date("2026-10-10T15:30:00Z"), ...over,
});
const transfer = (over: Record<string, any> = {}) => ({ finixTransferId: "TR1", churchId: "c1", paymentId: "pay1", amountCents: 5000, applicationFeeCents: 25, ...over });
const instrument = { finixPaymentInstrumentId: "pi1", cardBrand: "Visa", cardType: "CREDIT", cardLast4: "4242", bankLast4: null };

describe("classifyPayment", () => {
  it("pushes a normal card gift with the original date, a negative fee, and card details", () => {
    const g = classifyPayment(payment(), transfer(), instrument);
    expect(g.decision).toEqual({ kind: "PUSH" });
    expect(g).toMatchObject({ amountCents: 5000, feeCents: -200, receivedOn: "2026-10-10", method: "card", cardBrand: "Visa", cardSubtype: "credit", last4: "4242" });
  });

  it("maps bank payments to ach with the bank last4 and no card fields", () => {
    const g = classifyPayment(payment({ paymentMethodType: "BANK_ACCOUNT" }), transfer(), { ...instrument, cardLast4: null, bankLast4: "6789" });
    expect(g).toMatchObject({ method: "ach", last4: "6789", cardBrand: null, cardSubtype: null });
  });

  it.each([
    ["REFUNDED", "REFUNDED"], ["PARTIALLY_REFUNDED", "PARTIALLY_REFUNDED"], ["RETURNED", "RETURNED"], ["FAILED", "NOT_SUCCEEDED"], ["PENDING", "NOT_SUCCEEDED"], ["CANCELED", "NOT_SUCCEEDED"],
  ])("skips a %s payment with reason %s (never pushes money that isn't there)", (status, reason) => {
    expect(classifyPayment(payment({ status }), transfer(), instrument).decision).toEqual({ kind: "SKIP", reason });
  });

  it("a gift where the donor covered the fee is SENT at the gift amount WITHOUT the fee, and records no church cost", () => {
    const g = classifyPayment(payment({ amountCents: 25025, donationAmountCents: 25000, feeCoveredCents: 25, actualFinixFeesCents: 25 }), transfer({ applicationFeeCents: 0 }), instrument);
    expect(g.decision).toEqual({ kind: "PUSH" });
    expect(g.amountCents).toBe(25000); // not $250.25
    expect(g.feeCents).toBe(0); // the donor paid the fee; the church paid none
  });

  it("a gift where the donor did NOT cover the fee still records the real processing cost", () => {
    const g = classifyPayment(payment({ amountCents: 25000, donationAmountCents: 25000, feeCoveredCents: 0, actualFinixFeesCents: 175 }), transfer({ applicationFeeCents: 25 }), instrument);
    expect(g).toMatchObject({ amountCents: 25000, feeCents: -200 });
  });

  it("a fee-covered gift with no donationAmountCents falls back to the amount charged (older rows)", () => {
    const g = classifyPayment(payment({ amountCents: 5000, donationAmountCents: null, feeCoveredCents: 0 }), transfer(), instrument);
    expect(g.amountCents).toBe(5000);
  });

  it("skips goods-and-services payments and unsupported methods", () => {
    expect(classifyPayment(payment({ goodsServicesProvided: true }), transfer(), instrument).decision).toEqual({ kind: "SKIP", reason: "GOODS_OR_SERVICES" });
    expect(classifyPayment(payment({ paymentMethodType: "crypto" }), transfer(), instrument).decision).toEqual({ kind: "SKIP", reason: "UNSUPPORTED_PAYMENT_METHOD" });
  });

  it("recognizes every WGC spelling of card and bank", () => {
    for (const t of ["PAYMENT_CARD", "CARD", "card", "google_pay", "apple_pay"]) expect(toPcoMethod(t)).toBe("card");
    for (const t of ["BANK_ACCOUNT", "bank"]) expect(toPcoMethod(t)).toBe("ach");
    expect(toPcoMethod("wire")).toBeNull();
    expect(toCardSubtype("DEBIT")).toBe("debit");
    expect(toCardSubtype("weird")).toBe("unknown");
  });
});

describe("buildSettlementPlan", () => {
  const settled = { id: "s", churchId: "c1", finixSettlementId: "ST1", state: "SETTLED", totalAmountCents: 5000, settledAt: new Date("2026-10-11T00:00:00Z") };
  beforeEach(() => {
    [settlementFind, transferFind, paymentFind, instrumentFind].forEach((m) => m.mockReset());
    settlementFind.mockResolvedValue(settled);
    transferFind.mockResolvedValue([transfer()]);
    paymentFind.mockResolvedValue([payment()]);
    instrumentFind.mockResolvedValue([instrument]);
  });

  it("is eligible with a fully settled, reconciled, fee-complete settlement", async () => {
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan.eligible).toBe(true);
    expect(plan.gifts).toHaveLength(1);
    expect(plan.settledAt).toEqual(settled.settledAt);
  });

  it("blocks another church's settlement and anything not SETTLED", async () => {
    settlementFind.mockResolvedValue({ ...settled, churchId: "c2" });
    expect((await buildSettlementPlan("c1", "ST1")).reasons).toEqual(["NOT_SETTLED"]);
    settlementFind.mockResolvedValue({ ...settled, state: "PENDING" });
    expect((await buildSettlementPlan("c1", "ST1")).reasons).toEqual(["NOT_SETTLED"]);
    settlementFind.mockResolvedValue(null);
    expect((await buildSettlementPlan("c1", "ST1")).eligible).toBe(false);
  });

  it("blocks with no transfers, a transfer from another church, or a missing payment", async () => {
    transferFind.mockResolvedValue([]);
    expect((await buildSettlementPlan("c1", "ST1")).reasons).toEqual(["NO_TRANSFERS"]);
    transferFind.mockResolvedValue([transfer({ churchId: "c2" })]);
    expect((await buildSettlementPlan("c1", "ST1")).reasons).toEqual(["CROSS_CHURCH_TRANSFER"]);
    transferFind.mockResolvedValue([transfer({ paymentId: "ghost" })]);
    expect((await buildSettlementPlan("c1", "ST1")).reasons).toEqual(["MISSING_PAYMENT"]);
  });

  it("blocks when transfers don't add up to the settlement total (a transfer may not have synced yet)", async () => {
    settlementFind.mockResolvedValue({ ...settled, totalAmountCents: 9999 });
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan.reasons).toEqual(["TOTALS_DO_NOT_RECONCILE"]);
    expect(plan.safeMessage).toMatch(/retried automatically/);
  });

  it("waits for fees (not a merchant problem) when a gift to be sent has none yet", async () => {
    paymentFind.mockResolvedValue([payment({ actualFinixFeesCents: null })]);
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan).toMatchObject({ eligible: false, awaitingFees: true, reasons: [] });
  });

  it("a fee-covered gift does NOT wait for fee data (there is no church cost to record)", async () => {
    paymentFind.mockResolvedValue([payment({ amountCents: 5025, donationAmountCents: 5000, feeCoveredCents: 25, actualFinixFeesCents: null })]);
    transferFind.mockResolvedValue([transfer({ amountCents: 5025, applicationFeeCents: null })]);
    settlementFind.mockResolvedValue({ ...settled, totalAmountCents: 5025 });
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan.eligible).toBe(true);
    expect(plan.gifts[0]).toMatchObject({ amountCents: 5000, feeCents: 0 });
  });

  it("a skipped (refunded) payment with no fee data does NOT hold up the rest of the settlement", async () => {
    transferFind.mockResolvedValue([transfer(), transfer({ finixTransferId: "TR2", paymentId: "pay2", amountCents: 1000, applicationFeeCents: null })]);
    paymentFind.mockResolvedValue([payment(), payment({ id: "pay2", status: "REFUNDED", actualFinixFeesCents: null })]);
    settlementFind.mockResolvedValue({ ...settled, totalAmountCents: 6000 });
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan.eligible).toBe(true);
    expect(plan.gifts.map((g) => g.decision.kind)).toEqual(["PUSH", "SKIP"]);
  });

  it("reads payments scoped to the church", async () => {
    await buildSettlementPlan("c1", "ST1");
    expect(paymentFind.mock.calls[0][0].where.churchId).toBe("c1");
  });
});

describe("buildDonationPayload", () => {
  const gift = classifyPayment(payment(), transfer(), instrument);
  const input = { gift, paymentSourceId: "src1", pcoFundId: "fund1", pcoPersonId: "person1" };

  it("builds the documented request shape", () => {
    const { body } = buildDonationPayload(input);
    expect(body.data.type).toBe("Donation");
    expect(body.data.attributes).toEqual({ payment_method: "card", received_at: "2026-10-10", fee_cents: -200, payment_method_sub: "credit", payment_brand: "Visa", payment_last4: "4242" });
    expect(body.data.relationships).toEqual({ payment_source: { data: { type: "PaymentSource", id: "src1" } }, person: { data: { type: "Person", id: "person1" } } });
    expect(body.included).toEqual([{ type: "Designation", attributes: { amount_cents: 5000 }, relationships: { fund: { data: { type: "Fund", id: "fund1" } } } }]);
  });

  it("an anonymous gift has NO person relationship at all", () => {
    expect(buildDonationPayload({ ...input, pcoPersonId: null }).body.data.relationships).not.toHaveProperty("person");
  });

  it("ach gifts carry no card fields", () => {
    const ach = classifyPayment(payment({ paymentMethodType: "BANK_ACCOUNT" }), transfer(), { ...instrument, cardLast4: null, bankLast4: "6789" });
    const attrs = buildDonationPayload({ ...input, gift: ach }).body.data.attributes;
    expect(attrs).toEqual({ payment_method: "ach", received_at: "2026-10-10", fee_cents: -200, payment_last4: "6789" });
  });

  it("the summary contains ids and amounts only", () => {
    const { summary } = buildDonationPayload(input);
    expect(summary).toEqual({ amountCents: 5000, feeCents: -200, receivedOn: "2026-10-10", method: "card", pcoFundId: "fund1", pcoPersonId: "person1" });
    expect(JSON.stringify(summary)).not.toContain("4242");
  });

  it("hashes deterministically and changes when anything changes", () => {
    const a = buildDonationPayload(input).hash;
    expect(buildDonationPayload({ ...input }).hash).toBe(a);
    expect(buildDonationPayload({ ...input, pcoFundId: "other" }).hash).not.toBe(a);
    expect(buildDonationPayload({ ...input, pcoPersonId: null }).hash).not.toBe(a);
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
});

describe("helpers", () => {
  it("a mapped fund wins, otherwise the default, otherwise nothing", () => {
    const map = new Map([["f1", "p1"]]);
    expect(resolveTargetFund("f1", map, "pd")).toEqual({ pcoFundId: "p1", via: "MAPPING" });
    expect(resolveTargetFund("f2", map, "pd")).toEqual({ pcoFundId: "pd", via: "DEFAULT" });
    expect(resolveTargetFund(null, map, "pd")).toEqual({ pcoFundId: "pd", via: "DEFAULT" });
    expect(resolveTargetFund("f2", map, null)).toBeNull();
  });

  it("the batch description carries the settlement id so it can be found again", () => {
    expect(batchDescription("ST1", new Date("2026-10-11T12:00:00Z"))).toBe("WGC settlement ST1 · 2026-10-11");
    expect(batchDescription("ST1", null)).toBe("WGC settlement ST1");
  });
});

import { buildDayPlan, dateKeyOf, dayHasWork, dayUnitKey, parseDayUnitKey } from "../giftPlan";

describe("day units", () => {
  it("keys round-trip and reject anything that isn't a date", () => {
    expect(dayUnitKey("2026-10-14")).toBe("day:2026-10-14");
    expect(parseDayUnitKey("day:2026-10-14")).toBe("2026-10-14");
    for (const bad of ["ST123", "day:", "day:2026-1-4", "day:2026-10-14x", "day:../../x"]) expect(parseDayUnitKey(bad)).toBeNull();
    expect(dateKeyOf(new Date("2026-10-14T23:59:59Z"))).toBe("2026-10-14");
  });
});

describe("buildDayPlan", () => {
  beforeEach(() => {
    [transferFind, paymentFind, instrumentFind, recordFind].forEach((m) => m.mockReset());
    instrumentFind.mockResolvedValue([instrument]);
    transferFind.mockResolvedValue([]);
  });

  it("asks only for THIS church's payments on THIS day, in a final state, never before the go-live moment", async () => {
    paymentFind.mockResolvedValue([]);
    const since = new Date("2026-10-14T15:00:00Z");
    await buildDayPlan("c1", "2026-10-14", since);
    const where = paymentFind.mock.calls[0][0].where;
    expect(where.churchId).toBe("c1");
    expect(where.status.in).toEqual(["SUCCEEDED", "PARTIALLY_REFUNDED", "REFUNDED", "RETURNED"]);
    expect(where.createdAt.gte).toEqual(since); // later than midnight, so the go-live moment wins
    expect(where.createdAt.lt).toEqual(new Date("2026-10-15T00:00:00.000Z"));
  });

  it("uses midnight when go-live was on an earlier day, or there is no watermark", async () => {
    paymentFind.mockResolvedValue([]);
    await buildDayPlan("c1", "2026-10-14", new Date("2026-10-01T00:00:00Z"));
    expect(paymentFind.mock.calls[0][0].where.createdAt.gte).toEqual(new Date("2026-10-14T00:00:00.000Z"));
    await buildDayPlan("c1", "2026-10-14", null);
    expect(paymentFind.mock.calls[1][0].where.createdAt.gte).toEqual(new Date("2026-10-14T00:00:00.000Z"));
  });

  it("builds a gift per payment, needing no settlement and no fee data", async () => {
    paymentFind.mockResolvedValue([
      payment({ id: "pA", finixTransferId: "TRA", actualFinixFeesCents: null }),
      payment({ id: "pB", finixTransferId: null, status: "REFUNDED" }),
    ]);
    const plan = await buildDayPlan("c1", "2026-10-10", null);
    expect(plan).toMatchObject({ eligible: true, awaitingFees: false });
    expect(plan.gifts.map((g) => [g.paymentId, g.decision.kind])).toEqual([["pA", "PUSH"], ["pB", "SKIP"]]);
    expect(plan.gifts[0].feeCents).toBe(0); // fee not known yet: nothing is invented
  });

  it("a fee-covered gift goes at the gift amount with no fee, with no transfer row needed", async () => {
    paymentFind.mockResolvedValue([payment({ amountCents: 25025, donationAmountCents: 25000, feeCoveredCents: 25 })]);
    const [g] = (await buildDayPlan("c1", "2026-10-10", null)).gifts;
    expect(g).toMatchObject({ amountCents: 25000, feeCents: 0, decision: { kind: "PUSH" } });
  });

  it("an empty day is simply empty", async () => {
    paymentFind.mockResolvedValue([]);
    const plan = await buildDayPlan("c1", "2026-10-10", null);
    expect(plan.gifts).toEqual([]);
    expect(transferFind).not.toHaveBeenCalled();
  });
});

describe("dayHasWork", () => {
  beforeEach(() => {
    paymentFind.mockReset();
    recordFind.mockReset();
  });

  it("is true for a paid gift with no record yet, or one still waiting to be sent", async () => {
    paymentFind.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    recordFind.mockResolvedValue([{ paymentId: "p1", status: "CREATED" }]);
    expect(await dayHasWork("c1", "2026-10-10", null)).toBe(true); // p2 unrecorded
    recordFind.mockResolvedValue([{ paymentId: "p1", status: "CREATED" }, { paymentId: "p2", status: "PENDING" }]);
    expect(await dayHasWork("c1", "2026-10-10", null)).toBe(true);
    recordFind.mockResolvedValue([{ paymentId: "p1", status: "CREATED" }, { paymentId: "p2", status: "SENDING" }]);
    expect(await dayHasWork("c1", "2026-10-10", null)).toBe(true);
  });

  it("is false when everything is sent, skipped, or only held for a person (those wait on a human, not on us)", async () => {
    paymentFind.mockResolvedValue([{ id: "p1" }, { id: "p2" }, { id: "p3" }]);
    recordFind.mockResolvedValue([{ paymentId: "p1", status: "CREATED" }, { paymentId: "p2", status: "SKIPPED" }, { paymentId: "p3", status: "HELD" }]);
    expect(await dayHasWork("c1", "2026-10-10", null)).toBe(false);
  });

  it("is false for a day with no payments, without querying records", async () => {
    paymentFind.mockResolvedValue([]);
    expect(await dayHasWork("c1", "2026-10-10", null)).toBe(false);
    expect(recordFind).not.toHaveBeenCalled();
  });
});


describe("refunds are found even though Payment.status doesn't change", () => {
  const settled = { id: "s", churchId: "c1", finixSettlementId: "ST1", state: "SETTLED", totalAmountCents: 5000, settledAt: new Date("2026-10-11T00:00:00Z") };
  beforeEach(() => {
    [settlementFind, transferFind, paymentFind, instrumentFind, recordFind].forEach((m) => m.mockReset());
    refundFind.mockReset().mockResolvedValue([]);
    returnFind.mockReset().mockResolvedValue([]);
    instrumentFind.mockResolvedValue([instrument]);
    settlementFind.mockResolvedValue(settled);
    transferFind.mockResolvedValue([transfer({ amountCents: 5000 })]);
  });

  it("a FULLY REFUNDED gift (payment still says SUCCEEDED) is skipped, never sent, in a day batch", async () => {
    paymentFind.mockResolvedValue([payment({ amountCents: 5000, donationAmountCents: 5000, finixTransferId: "TR1" })]);
    refundFind.mockResolvedValue([{ finixOriginalTransferId: "TR1", amountCents: 5000, state: "SUCCEEDED" }]);
    const plan = await buildDayPlan("c1", "2026-10-10", null);
    expect(plan.gifts[0].decision).toEqual({ kind: "SKIP", reason: "REFUNDED" });
  });

  it("…and in a settlement plan", async () => {
    paymentFind.mockResolvedValue([payment({ amountCents: 5000, donationAmountCents: 5000, finixTransferId: "TR1" })]);
    refundFind.mockResolvedValue([{ finixOriginalTransferId: "TR1", amountCents: 5000, state: "SUCCEEDED" }]);
    const plan = await buildSettlementPlan("c1", "ST1");
    expect(plan.gifts[0].decision).toEqual({ kind: "SKIP", reason: "REFUNDED" });
  });

  it("a partial refund is skipped for a person to enter by hand; a bank return is skipped", async () => {
    paymentFind.mockResolvedValue([payment({ id: "pA", finixTransferId: "TRA" }), payment({ id: "pB", finixTransferId: "TRB" })]);
    refundFind.mockResolvedValue([{ finixOriginalTransferId: "TRA", amountCents: 1000, state: "SUCCEEDED" }]);
    returnFind.mockResolvedValue([{ originalTransferId: "TRB", amountCents: 5000 }]);
    const plan = await buildDayPlan("c1", "2026-10-10", null);
    expect(plan.gifts.map((g) => g.decision)).toEqual([{ kind: "SKIP", reason: "PARTIALLY_REFUNDED" }, { kind: "SKIP", reason: "RETURNED" }]);
  });

  it("a refund still IN PROGRESS leaves the gift out of the plan entirely, so it is decided once the refund settles", async () => {
    paymentFind.mockResolvedValue([payment({ id: "pA", finixTransferId: "TRA" }), payment({ id: "pB", finixTransferId: "TRB" })]);
    refundFind.mockResolvedValue([{ finixOriginalTransferId: "TRA", amountCents: 5000, state: "PENDING" }]);
    const plan = await buildDayPlan("c1", "2026-10-10", null);
    expect(plan.gifts.map((g) => g.paymentId)).toEqual(["pB"]);
  });
});
