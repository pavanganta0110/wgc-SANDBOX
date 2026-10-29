import { describe, it, expect } from "vitest";
import {
  buildExternalLedgerRow,
  buildPaymentLedgerRow,
  splitDonorName,
  type LedgerExternalSource,
  type LedgerLookups,
  type LedgerPaymentSource,
} from "../ledgerRow";

const donor = {
  id: "donor1",
  name: "Maya Torres",
  salutation: "Ms.",
  email: "maya@example.com",
  phone: "+15555550100",
  addressLine1: "12 Elm St",
  addressLine2: null,
  city: "Springfield",
  state: "MO",
  postalCode: "65802",
  country: "US",
};

function lookups(overrides: Partial<LedgerLookups> = {}): LedgerLookups {
  return {
    donors: new Map([["donor1", donor]]),
    refundedCentsByPaymentId: new Map(),
    disputeStateByPaymentId: new Map(),
    transfersByFinixTransferId: new Map(),
    ...overrides,
  };
}

function payment(overrides: Partial<LedgerPaymentSource> = {}): LedgerPaymentSource {
  return {
    id: "pay1",
    donorId: "donor1",
    createdAt: new Date("2026-03-04T15:00:00Z"),
    status: "SUCCEEDED",
    paymentMethodType: "PAYMENT_CARD",
    cardBrand: "VISA",
    amountCents: 10_320,
    donationAmountCents: 10_000,
    feeCoveredCents: 320,
    donorCoversFee: true,
    actualFinixFeesCents: null,
    merchantExpectedNetCents: 10_000,
    fundId: "fund1",
    fundName: "Summer Missions",
    finixSubscriptionId: null,
    finixTransferId: "TR_1",
    goodsServicesProvided: false,
    goodsServicesDescription: null,
    goodsServicesFairMarketValueCents: null,
    givingLinkId: "link1",
    receiptNumber: "R-1",
    ...overrides,
  };
}

function external(overrides: Partial<LedgerExternalSource> = {}): LedgerExternalSource {
  return {
    id: "ext1",
    donorId: "donor1",
    donationDate: new Date("2026-03-05T00:00:00Z"),
    paymentMethod: "CHECK",
    status: "RECORDED",
    donationAmountCents: 25_000,
    supplementalFeeCents: 0,
    processingFeeCents: 0,
    providerFeeCents: null,
    netAmountReceivedCents: 25_000,
    fundId: "fund2",
    fundName: "Building",
    goodsOrServicesProvided: false,
    goodsOrServicesDescription: null,
    goodsOrServicesValueCents: null,
    finixSettlementId: null,
    voidedAt: null,
    receiptNumber: null,
    ...overrides,
  };
}

describe("splitDonorName", () => {
  it("treats the last word as the last name and the rest as the first", () => {
    expect(splitDonorName("Maya Torres")).toEqual({ firstName: "Maya", lastName: "Torres" });
    expect(splitDonorName("  Mary Ann  Smith ")).toEqual({ firstName: "Mary Ann", lastName: "Smith" });
  });

  it("treats a single word as a first name only, and empty input as nothing", () => {
    expect(splitDonorName("Cher")).toEqual({ firstName: "Cher", lastName: null });
    expect(splitDonorName("")).toEqual({ firstName: null, lastName: null });
    expect(splitDonorName(null)).toEqual({ firstName: null, lastName: null });
  });
});

describe("buildPaymentLedgerRow", () => {
  it("maps a one-time card gift with designation, donor and fee cover", () => {
    const row = buildPaymentLedgerRow(payment(), lookups());
    expect(row).toMatchObject({
      id: "pay1",
      source: "WGC",
      date: "2026-03-04T15:00:00.000Z",
      kind: "one-time",
      method: "card",
      cardBrand: "VISA",
      designation: { fundId: "fund1", fundName: "Summer Missions" },
      giftCents: 10_000,
      feeCoveredCents: 320,
      feeCoveredElected: true,
      chargedCents: 10_320,
      subscriptionId: null,
      givingLinkId: "link1",
      voided: false,
    });
    expect(row.donor).toMatchObject({ id: "donor1", firstName: "Maya", lastName: "Torres", email: "maya@example.com", city: "Springfield", salutation: "Ms." });
  });

  it("falls back to the expected net until the actual processing fee is known, then uses the actual fee", () => {
    const before = buildPaymentLedgerRow(payment(), lookups());
    expect(before.processingFeeCents).toBeNull();
    expect(before.netCents).toBe(10_000);

    const after = buildPaymentLedgerRow(payment({ actualFinixFeesCents: 350 }), lookups());
    expect(after.processingFeeCents).toBe(350);
    expect(after.netCents).toBe(10_320 - 350);
  });

  it("reads the processing fee and payout id from the Finix transfer when present", () => {
    const row = buildPaymentLedgerRow(
      payment(),
      lookups({ transfersByFinixTransferId: new Map([["TR_1", { settlementId: "ST_9", feeCents: 340 }]]) })
    );
    expect(row.payoutId).toBe("ST_9");
    expect(row.processingFeeCents).toBe(340);
  });

  it("marks a renewal as recurring and carries the subscription id and ACH method", () => {
    const row = buildPaymentLedgerRow(payment({ paymentMethodType: "BANK_ACCOUNT", cardBrand: "VISA", finixSubscriptionId: "SUB_1" }), lookups());
    expect(row.kind).toBe("recurring");
    expect(row.subscriptionId).toBe("SUB_1");
    expect(row.method).toBe("ach");
    expect(row.cardBrand).toBeNull();
  });

  it("flags refunds, disputes and bank returns", () => {
    const refunded = buildPaymentLedgerRow(payment(), lookups({ refundedCentsByPaymentId: new Map([["pay1", 4_000]]) }));
    expect(refunded).toMatchObject({ refunded: true, refundedCents: 4_000, disputed: false, disputeState: null });

    const disputed = buildPaymentLedgerRow(payment(), lookups({ disputeStateByPaymentId: new Map([["pay1", "INQUIRY"]]) }));
    expect(disputed).toMatchObject({ disputed: true, disputeState: "INQUIRY", refunded: false });

    const returned = buildPaymentLedgerRow(payment({ status: "RETURNED", paymentMethodType: "BANK_ACCOUNT" }), lookups());
    expect(returned.returned).toBe(true);
  });

  it("only reports goods and services when some were provided", () => {
    const none = buildPaymentLedgerRow(payment({ goodsServicesProvided: false, goodsServicesFairMarketValueCents: 5_000, goodsServicesDescription: "Dinner" }), lookups());
    expect(none.fairMarketValueCents).toBeNull();
    expect(none.goodsDescription).toBeNull();

    const some = buildPaymentLedgerRow(payment({ goodsServicesProvided: true, goodsServicesFairMarketValueCents: 5_000, goodsServicesDescription: "Dinner" }), lookups());
    expect(some.fairMarketValueCents).toBe(5_000);
    expect(some.goodsDescription).toBe("Dinner");
  });

  it("gives a null donor when the gift has no donor or the donor wasn't loaded", () => {
    expect(buildPaymentLedgerRow(payment({ donorId: null }), lookups()).donor).toBeNull();
    expect(buildPaymentLedgerRow(payment({ donorId: "missing" }), lookups()).donor).toBeNull();
  });
});

describe("buildExternalLedgerRow", () => {
  it("maps a recorded check as an external one-time gift with its fund", () => {
    const row = buildExternalLedgerRow(external(), lookups());
    expect(row).toMatchObject({
      id: "ext1",
      source: "EXTERNAL",
      date: "2026-03-05T00:00:00.000Z",
      kind: "one-time",
      method: "external",
      externalMethod: "CHECK",
      designation: { fundId: "fund2", fundName: "Building" },
      giftCents: 25_000,
      chargedCents: 25_000,
      netCents: 25_000,
      refunded: false,
      subscriptionId: null,
      voided: false,
    });
  });

  it("flags a voided external gift and carries a payout id when WGC processed it", () => {
    const row = buildExternalLedgerRow(external({ voidedAt: new Date("2026-03-06T00:00:00Z"), finixSettlementId: "ST_2", processingFeeCents: 120 }), lookups());
    expect(row.voided).toBe(true);
    expect(row.payoutId).toBe("ST_2");
    expect(row.processingFeeCents).toBe(120);
  });
});
