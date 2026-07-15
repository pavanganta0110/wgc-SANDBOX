import { describe, it, expect } from "vitest";
import { selectMerchantFundingTransfer, mapFundingTransferFields, isFreshEnoughToApply, findFundingTransfersHref } from "@/lib/finix/sync/settlementFundingSync";

// Fixtures below mirror the exact shape of a real GET
// /settlements/{id}/funding_transfers sandbox response, captured live
// during this fix (settlement STcBXymCLMy1VKRnWG4mxWh, church "Ganta
// Holdings"): gross $1,492.08 / fees $84.16 / net $1,407.92.
const REAL_PLATFORM_TRANSFER = {
  id: "TRnJyns72KCA2nAmhcJ8xmYt",
  amount: 8416,
  merchant: "MUiNsJJTzCDXMpQR4euoNUxk",
  destination: "PIn21JMoPv7ETVUsX2veerqz",
  state: "SUCCEEDED",
  subtype: "SETTLEMENT_PLATFORM",
  operation_key: null,
  trace_id: "a4e93946-1db1-43d6-aa93-d0d38b8cfca7",
};
const REAL_MERCHANT_TRANSFER = {
  id: "TR4BpDsBWjxFhoV6MQpM4etf",
  amount: 140792,
  merchant: "MUiNsJJTzCDXMpQR4euoNUxk",
  destination: "PIeaoMKZnyKCWP9zzp2BdbSr",
  state: "SUCCEEDED",
  subtype: "SETTLEMENT_MERCHANT",
  operation_key: "STANDARD_MERCHANT_FUNDING_PUSH_TO_ACH",
  trace_id: "702a4567-1255-457e-980c-10aa3200cbac",
};

describe("selectMerchantFundingTransfer", () => {
  it("returns null when there are no funding transfers", () => {
    expect(selectMerchantFundingTransfer([], "MUiNsJJTzCDXMpQR4euoNUxk")).toBeNull();
  });

  it("selects the SETTLEMENT_MERCHANT transfer and excludes SETTLEMENT_PLATFORM — the exact real sandbox scenario", () => {
    const result = selectMerchantFundingTransfer([REAL_PLATFORM_TRANSFER, REAL_MERCHANT_TRANSFER], "MUiNsJJTzCDXMpQR4euoNUxk");
    expect(result).toBe(REAL_MERCHANT_TRANSFER);
    expect(result?.amount).toBe(140792);
  });

  it("never returns a SETTLEMENT_PLATFORM transfer even without a merchant id to disambiguate", () => {
    expect(selectMerchantFundingTransfer([REAL_PLATFORM_TRANSFER], null)).toBeNull();
  });

  it("returns null when a settlement has only a platform deposit and no merchant deposit", () => {
    expect(selectMerchantFundingTransfer([REAL_PLATFORM_TRANSFER], "MUiNsJJTzCDXMpQR4euoNUxk")).toBeNull();
  });

  it("returns the single SETTLEMENT_MERCHANT candidate when there's exactly one and no merchant id given", () => {
    expect(selectMerchantFundingTransfer([REAL_MERCHANT_TRANSFER], null)).toBe(REAL_MERCHANT_TRANSFER);
  });

  it("does not guess when multiple SETTLEMENT_MERCHANT candidates exist and none match the merchant id", () => {
    const other = { ...REAL_MERCHANT_TRANSFER, id: "TRother", merchant: "MUother999" };
    expect(selectMerchantFundingTransfer([REAL_MERCHANT_TRANSFER, other], "MUdoesnotmatch")).toBeNull();
  });
});

describe("mapFundingTransferFields", () => {
  it("maps the exact real sandbox merchant transfer correctly", () => {
    const mapped = mapFundingTransferFields(REAL_MERCHANT_TRANSFER);
    expect(mapped.state).toBe("SUCCEEDED");
    expect(mapped.amountCents).toBe(140792);
    expect(mapped.destinationPaymentInstrumentId).toBe("PIeaoMKZnyKCWP9zzp2BdbSr");
    expect(mapped.traceId).toBe("702a4567-1255-457e-980c-10aa3200cbac");
  });

  it("never fabricates bank fields this Finix object doesn't actually carry — confirmed absent from a real response", () => {
    const mapped = mapFundingTransferFields(REAL_MERCHANT_TRANSFER);
    expect(mapped.bankName).toBeNull();
    expect(mapped.bankAccountLast4).toBeNull();
    expect(mapped.bankAccountType).toBeNull();
    expect(mapped.fundingSpeed).toBeNull();
  });

  it("never includes a full account or routing number field", () => {
    const mapped = mapFundingTransferFields({ ...REAL_MERCHANT_TRANSFER, account_number: "000123456789", routing_number: "021000021" });
    expect(JSON.stringify(mapped)).not.toContain("000123456789");
    expect(JSON.stringify(mapped)).not.toContain("021000021");
  });

  it("falls back gracefully when fields are missing", () => {
    const mapped = mapFundingTransferFields({});
    expect(mapped.state).toBeNull();
    expect(mapped.destinationPaymentInstrumentId).toBeNull();
  });
});

describe("findFundingTransfersHref", () => {
  it("extracts the real confirmed href shape from a settlement's _links", () => {
    const settlement = {
      _links: {
        self: { href: "https://finix.sandbox-payments-api.com/settlements/STcBXymCLMy1VKRnWG4mxWh" },
        funding_transfers: { href: "https://finix.sandbox-payments-api.com/settlements/STcBXymCLMy1VKRnWG4mxWh/funding_transfers" },
        transfers: { href: "https://finix.sandbox-payments-api.com/settlements/STcBXymCLMy1VKRnWG4mxWh/transfers" },
      },
    };
    expect(findFundingTransfersHref(settlement)).toBe("https://finix.sandbox-payments-api.com/settlements/STcBXymCLMy1VKRnWG4mxWh/funding_transfers");
  });

  it("returns null when there is no _links object", () => {
    expect(findFundingTransfersHref({})).toBeNull();
    expect(findFundingTransfersHref(null)).toBeNull();
  });

  it("returns null when no link key matches funding/deposit", () => {
    expect(findFundingTransfersHref({ _links: { self: { href: "https://x/settlements/1" } } })).toBeNull();
  });
});

describe("isFreshEnoughToApply", () => {
  it("allows applying when there is no existing timestamp", () => {
    expect(isFreshEnoughToApply(null, new Date("2026-01-01"))).toBe(true);
  });

  it("allows applying when the incoming timestamp is missing (defaults to trusting the sync)", () => {
    expect(isFreshEnoughToApply(new Date("2026-01-01"), null)).toBe(true);
  });

  it("rejects an out-of-order (older) incoming update", () => {
    const existing = new Date("2026-01-02T12:00:00Z");
    const incoming = new Date("2026-01-01T12:00:00Z");
    expect(isFreshEnoughToApply(existing, incoming)).toBe(false);
  });

  it("allows a newer incoming update", () => {
    const existing = new Date("2026-01-01T12:00:00Z");
    const incoming = new Date("2026-01-02T12:00:00Z");
    expect(isFreshEnoughToApply(existing, incoming)).toBe(true);
  });

  it("allows an equal timestamp (idempotent re-delivery of the same event)", () => {
    const same = new Date("2026-01-01T12:00:00Z");
    expect(isFreshEnoughToApply(same, same)).toBe(true);
  });
});
