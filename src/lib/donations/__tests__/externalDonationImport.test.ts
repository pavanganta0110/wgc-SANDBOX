import { describe, it, expect } from "vitest";
import {
  suggestColumnMapping,
  findDuplicateMappings,
  mapRow,
  parseYesNo,
  parseAmountToCents,
  parseImportDate,
  resolvePaymentMethod,
  computeRowFingerprint,
  validateMappedRow,
  type MappedImportRow,
} from "@/lib/donations/externalDonationImport";

function blankRow(overrides: Partial<MappedImportRow> = {}): MappedImportRow {
  return {
    donorFirstName: null,
    donorLastName: null,
    donorEmail: null,
    donorPhone: null,
    donorAddress: null,
    amount: null,
    donationDate: null,
    paymentMethod: null,
    fund: null,
    campaign: null,
    referenceNumber: null,
    taxDeductible: null,
    deductibleAmount: null,
    goodsOrServicesProvided: null,
    goodsOrServicesValue: null,
    anonymous: null,
    notes: null,
    sendReceipt: null,
    ...overrides,
  };
}

describe("suggestColumnMapping", () => {
  it("maps recognized header aliases case-insensitively", () => {
    const mapping = suggestColumnMapping(["Email Address", "GIFT AMOUNT", "Gift Date", "Payment Type"]);
    expect(mapping["Email Address"]).toBe("donorEmail");
    expect(mapping["GIFT AMOUNT"]).toBe("amount");
    expect(mapping["Gift Date"]).toBe("donationDate");
    expect(mapping["Payment Type"]).toBe("paymentMethod");
  });

  it("maps unrecognized headers to null (skip)", () => {
    const mapping = suggestColumnMapping(["Favorite Color"]);
    expect(mapping["Favorite Color"]).toBeNull();
  });

  it("maps snake_case aliases", () => {
    const mapping = suggestColumnMapping(["donor_first_name", "donation_date", "reference_number"]);
    expect(mapping["donor_first_name"]).toBe("donorFirstName");
    expect(mapping["donation_date"]).toBe("donationDate");
    expect(mapping["reference_number"]).toBe("referenceNumber");
  });
});

describe("findDuplicateMappings", () => {
  it("returns fields mapped from more than one source column", () => {
    const dupes = findDuplicateMappings({ colA: "amount", colB: "amount", colC: "donationDate" });
    expect(dupes).toEqual(["amount"]);
  });

  it("returns an empty array when every field maps from exactly one column", () => {
    const dupes = findDuplicateMappings({ colA: "amount", colB: "donationDate" });
    expect(dupes).toEqual([]);
  });

  it("ignores skipped (null) columns", () => {
    const dupes = findDuplicateMappings({ colA: null, colB: null });
    expect(dupes).toEqual([]);
  });
});

describe("mapRow", () => {
  it("maps values into their destination fields per the column mapping", () => {
    const headers = ["Name", "Amount", "Unmapped"];
    const row = ["Jane Doe", "100.00", "ignored"];
    const mapping = { Name: "donorFirstName" as const, Amount: "amount" as const, Unmapped: null };
    const mapped = mapRow(headers, row, mapping);
    expect(mapped.donorFirstName).toBe("Jane Doe");
    expect(mapped.amount).toBe("100.00");
    expect(mapped.donorLastName).toBeNull();
  });

  it("trims whitespace and turns blank strings into null", () => {
    const mapped = mapRow(["Amount"], ["  100.00  "], { Amount: "amount" });
    expect(mapped.amount).toBe("100.00");
    const blank = mapRow(["Amount"], ["   "], { Amount: "amount" });
    expect(blank.amount).toBeNull();
  });
});

describe("parseYesNo", () => {
  it("accepts common truthy spellings case-insensitively", () => {
    for (const v of ["yes", "YES", "y", "true", "1"]) {
      expect(parseYesNo(v)).toEqual({ value: true, valid: true });
    }
  });

  it("accepts common falsy spellings case-insensitively", () => {
    for (const v of ["no", "NO", "n", "false", "0"]) {
      expect(parseYesNo(v)).toEqual({ value: false, valid: true });
    }
  });

  it("treats null/blank as unspecified but valid", () => {
    expect(parseYesNo(null)).toEqual({ value: undefined, valid: true });
  });

  it("flags anything else as invalid", () => {
    expect(parseYesNo("maybe")).toEqual({ value: undefined, valid: false });
  });
});

describe("parseAmountToCents", () => {
  it("parses plain and currency-formatted amounts", () => {
    expect(parseAmountToCents("100")).toBe(10000);
    expect(parseAmountToCents("100.50")).toBe(10050);
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
  });

  it("returns null for unparseable input", () => {
    expect(parseAmountToCents("abc")).toBeNull();
    expect(parseAmountToCents("1.234")).toBeNull();
    expect(parseAmountToCents(null)).toBeNull();
  });

  it("preserves negative amounts (validation, not parsing, rejects them)", () => {
    expect(parseAmountToCents("-50")).toBe(-5000);
  });
});

describe("parseImportDate", () => {
  it("parses MM/DD/YYYY", () => {
    const date = parseImportDate("1/15/2026");
    expect(date?.getUTCFullYear()).toBe(2026);
    expect(date?.getUTCMonth()).toBe(0);
    expect(date?.getUTCDate()).toBe(15);
  });

  it("parses 2-digit years as 20XX", () => {
    const date = parseImportDate("3/4/26");
    expect(date?.getUTCFullYear()).toBe(2026);
  });

  it("parses ISO dates", () => {
    const date = parseImportDate("2026-02-01");
    expect(date).not.toBeNull();
  });

  it("rejects a day that rolls over into the next month (e.g. Feb 30)", () => {
    expect(parseImportDate("2/30/2026")).toBeNull();
  });

  it("rejects unparseable strings", () => {
    expect(parseImportDate("not-a-date")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(parseImportDate(null)).toBeNull();
    expect(parseImportDate("")).toBeNull();
  });
});

describe("resolvePaymentMethod", () => {
  it("defaults to CASH when omitted", () => {
    expect(resolvePaymentMethod(null)).toEqual({ method: "CASH", otherName: null, recognized: true });
  });

  it("recognizes canonical enum values directly", () => {
    expect(resolvePaymentMethod("ZELLE").method).toBe("ZELLE");
    expect(resolvePaymentMethod("zelle").method).toBe("ZELLE");
  });

  it("maps common aliases to canonical methods", () => {
    expect(resolvePaymentMethod("Cheque").method).toBe("CHECK");
    expect(resolvePaymentMethod("ACH").method).toBe("BANK_TRANSFER");
    expect(resolvePaymentMethod("Credit Card").method).toBe("EXTERNAL_CARD_TERMINAL");
  });

  it("falls back to OTHER for unrecognized values, preserving the original label", () => {
    const result = resolvePaymentMethod("Bitcoin");
    expect(result.method).toBe("OTHER");
    expect(result.otherName).toBe("Bitcoin");
    expect(result.recognized).toBe(false);
  });
});

describe("computeRowFingerprint", () => {
  const base = { donorEmail: "jane@example.com", donorFirstName: "Jane", donorLastName: "Doe", amountCents: 10000, donationDate: "2026-01-15", referenceNumber: "555" };

  it("is deterministic for identical input", () => {
    expect(computeRowFingerprint("church-a", base)).toBe(computeRowFingerprint("church-a", base));
  });

  it("differs when the church differs (no cross-org fingerprint collisions)", () => {
    expect(computeRowFingerprint("church-a", base)).not.toBe(computeRowFingerprint("church-b", base));
  });

  it("differs when the amount differs", () => {
    const other = { ...base, amountCents: 5000 };
    expect(computeRowFingerprint("church-a", base)).not.toBe(computeRowFingerprint("church-a", other));
  });

  it("falls back to donor name when no email is given, still deterministic", () => {
    const noEmail = { ...base, donorEmail: null };
    expect(computeRowFingerprint("church-a", noEmail)).toBe(computeRowFingerprint("church-a", noEmail));
    expect(computeRowFingerprint("church-a", noEmail)).not.toBe(computeRowFingerprint("church-a", base));
  });
});

describe("validateMappedRow", () => {
  it("accepts a fully valid row with no errors or warnings", () => {
    const result = validateMappedRow(
      blankRow({ donorFirstName: "Jane", donorLastName: "Doe", donorEmail: "jane@example.com", amount: "100.00", donationDate: "2026-01-15", paymentMethod: "CASH" })
    );
    expect(result.errors).toEqual([]);
    expect(result.amountCents).toBe(10000);
  });

  it("requires an amount", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", donationDate: "2026-01-15" }));
    expect(result.errors).toContain("Missing donation amount");
  });

  it("rejects a zero or negative amount without silently coercing it", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", donationDate: "2026-01-15", amount: "-50" }));
    expect(result.errors).toContain("Amount must be greater than zero");
  });

  it("requires a donation date", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10" }));
    expect(result.errors).toContain("Missing donation date");
  });

  it("rejects an unparseable date", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "not-a-date" }));
    expect(result.errors).toContain("Invalid date");
  });

  it("warns (does not error) on a future donation date", () => {
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: future }));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toContain("Donation date is in the future");
  });

  it("requires a donor name, email, or phone unless the row is anonymous", () => {
    const result = validateMappedRow(blankRow({ amount: "10", donationDate: "2026-01-15" }));
    expect(result.errors).toContain("Provide a donor name, email, or phone");
  });

  it("does not require donor identity when the row is marked anonymous", () => {
    const result = validateMappedRow(blankRow({ amount: "10", donationDate: "2026-01-15", anonymous: "yes" }));
    expect(result.errors).not.toContain("Provide a donor name, email, or phone");
    expect(result.isAnonymous).toBe(true);
  });

  it("rejects an invalid donor email", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15", donorEmail: "not-an-email" }));
    expect(result.errors).toContain("Invalid donor email address");
  });

  it("defaults isTaxDeductible to true when unspecified", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15" }));
    expect(result.isTaxDeductible).toBe(true);
  });

  it("rejects a deductible amount greater than the donation amount", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15", deductibleAmount: "50" }));
    expect(result.errors).toContain("Deductible amount is greater than the donation amount");
  });

  it("rejects a goods/services value greater than the donation amount", () => {
    const result = validateMappedRow(
      blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15", goodsOrServicesProvided: "yes", goodsOrServicesValue: "50" })
    );
    expect(result.errors).toContain("Goods or services value is greater than the donation amount");
  });

  it("rejects a non yes/no value for the boolean-ish columns", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15", taxDeductible: "sort of" }));
    expect(result.errors).toContain('Invalid value for "Tax Deductible" — use yes or no');
  });

  it("warns instead of erroring on an unrecognized payment method (imports as Other)", () => {
    const result = validateMappedRow(blankRow({ donorFirstName: "Jane", amount: "10", donationDate: "2026-01-15", paymentMethod: "Bitcoin" }));
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => w.includes("Unrecognized payment method"))).toBe(true);
    expect(result.paymentMethod).toBe("OTHER");
  });
});
