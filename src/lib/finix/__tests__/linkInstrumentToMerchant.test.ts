import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFinix = { createPaymentInstrumentAssociation: vi.fn() };
vi.mock("@/lib/finix/client", () => ({ finixClient: mockFinix }));

const { linkBankInstrumentToMerchant } = await import("../linkInstrumentToMerchant");

describe("linkBankInstrumentToMerchant", () => {
  const original = process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED = "true";
  });
  afterEach(() => {
    process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED = original;
  });

  const bank = { id: "PI1", type: "BANK_ACCOUNT" };

  it("links a bank instrument to the church's merchant", async () => {
    mockFinix.createPaymentInstrumentAssociation.mockResolvedValue({});
    expect(await linkBankInstrumentToMerchant({ instrument: bank, merchantId: "MU1", source: "donate" })).toBe("LINKED");
    expect(mockFinix.createPaymentInstrumentAssociation).toHaveBeenCalledWith({ merchant_id: "MU1", payment_instrument_id: "PI1", tags: { source: "wgc", flow: "donate" } });
  });

  it("does nothing unless the switch is exactly \"true\"", async () => {
    for (const v of [undefined, "false", "1", "TRUE"]) {
      if (v === undefined) delete process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED;
      else process.env.FINIX_BANK_INSTRUMENT_LINK_ENABLED = v;
      expect(await linkBankInstrumentToMerchant({ instrument: bank, merchantId: "MU1", source: "donate" })).toBe("SKIPPED");
    }
    expect(mockFinix.createPaymentInstrumentAssociation).not.toHaveBeenCalled();
  });

  it("skips cards, wallets, and missing ids", async () => {
    expect(await linkBankInstrumentToMerchant({ instrument: { id: "PI2", type: "PAYMENT_CARD" }, merchantId: "MU1", source: "donate" })).toBe("SKIPPED");
    expect(await linkBankInstrumentToMerchant({ instrument: { id: "PI3", type: "GOOGLE_PAY" }, merchantId: "MU1", source: "donate" })).toBe("SKIPPED");
    expect(await linkBankInstrumentToMerchant({ instrument: { id: null, type: "BANK_ACCOUNT" }, merchantId: "MU1", source: "donate" })).toBe("SKIPPED");
    expect(await linkBankInstrumentToMerchant({ instrument: bank, merchantId: null, source: "donate" })).toBe("SKIPPED");
    expect(await linkBankInstrumentToMerchant({ instrument: undefined, merchantId: "MU1", source: "donate" })).toBe("SKIPPED");
    expect(mockFinix.createPaymentInstrumentAssociation).not.toHaveBeenCalled();
  });

  it("never throws: a Finix failure (including its generic 500 for a duplicate) is logged and the gift goes on", async () => {
    mockFinix.createPaymentInstrumentAssociation.mockRejectedValue(Object.assign(new Error("Finix Error: Sorry, something went wrong."), { status: 500 }));
    expect(await linkBankInstrumentToMerchant({ instrument: bank, merchantId: "MU1", source: "invoice-pay" })).toBe("FAILED");
  });
});
