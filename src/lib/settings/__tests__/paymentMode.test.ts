import { describe, it, expect } from "vitest";
import {
  modeLabel,
  noteOnCustomerReceipt,
  noteOnStaffCopy,
  parsePaymentModeUpdate,
  parseReceiptNoteMode,
  resolvePaymentTerm,
  toPaymentWording,
} from "@/lib/settings/paymentMode";

describe("modeLabel", () => {
  it("keeps the original wording when payment mode is off", () => {
    expect(modeLabel(false, "donor")).toBe("Donor");
    expect(modeLabel(undefined, "donations")).toBe("Donations");
    expect(modeLabel(null, "giving")).toBe("Giving");
  });

  it("switches to payer/payment wording when payment mode is on", () => {
    expect(modeLabel(true, "donor")).toBe("Payer");
    expect(modeLabel(true, "donors")).toBe("Payers");
    expect(modeLabel(true, "donation")).toBe("Payment");
    expect(modeLabel(true, "gifts")).toBe("Payments");
    expect(modeLabel(true, "giving")).toBe("Payments");
  });

  it("supports the lowercase mid-sentence form", () => {
    expect(modeLabel(true, "donor", { lower: true })).toBe("payer");
    expect(modeLabel(false, "donation", { lower: true })).toBe("donation");
  });
});

describe("receipt note mode", () => {
  it("falls back to NONE for anything unrecognised", () => {
    expect(parseReceiptNoteMode("bogus")).toBe("NONE");
    expect(parseReceiptNoteMode(undefined)).toBe("NONE");
  });

  it("routes the note to the customer receipt, the staff copy, or both", () => {
    expect([noteOnCustomerReceipt("NONE"), noteOnStaffCopy("NONE")]).toEqual([false, false]);
    expect([noteOnCustomerReceipt("CUSTOMER"), noteOnStaffCopy("CUSTOMER")]).toEqual([true, false]);
    expect([noteOnCustomerReceipt("STAFF"), noteOnStaffCopy("STAFF")]).toEqual([false, true]);
    expect([noteOnCustomerReceipt("BOTH"), noteOnStaffCopy("BOTH")]).toEqual([true, true]);
  });
});

describe("parsePaymentModeUpdate", () => {
  it("returns only the keys that were sent", () => {
    expect(parsePaymentModeUpdate({ paymentMode: true })).toEqual({ data: { paymentMode: true } });
    expect(parsePaymentModeUpdate({ receiptNoteMode: "BOTH", termFieldEnabled: false })).toEqual({
      data: { receiptNoteMode: "BOTH", termFieldEnabled: false },
    });
  });

  it("rejects non-boolean flags and unknown note modes", () => {
    expect(parsePaymentModeUpdate({ paymentMode: "yes" })).toEqual({ error: "paymentMode must be true or false." });
    expect(parsePaymentModeUpdate({ receiptNoteMode: "ALL" })).toHaveProperty("error");
  });

  it("rejects an empty or non-object body", () => {
    expect(parsePaymentModeUpdate({})).toEqual({ error: "Nothing to update." });
    expect(parsePaymentModeUpdate(null)).toEqual({ error: "Invalid request body." });
  });
});

describe("resolvePaymentTerm", () => {
  it("uses the term staff typed when the term field is on", () => {
    expect(resolvePaymentTerm({ termFieldEnabled: true, submittedTerm: "  Spring   2026 ", studentTerm: "Fall 2026" })).toBe("Spring 2026");
  });

  it("falls back to the student's current term when nothing was typed", () => {
    expect(resolvePaymentTerm({ termFieldEnabled: true, submittedTerm: "", studentTerm: "Fall 2026" })).toBe("Fall 2026");
    expect(resolvePaymentTerm({ termFieldEnabled: true, submittedTerm: undefined, studentTerm: null })).toBeNull();
  });

  it("ignores a submitted term when the org has the field off", () => {
    expect(resolvePaymentTerm({ termFieldEnabled: false, submittedTerm: "Spring 2026", studentTerm: "Fall 2026" })).toBe("Fall 2026");
    expect(resolvePaymentTerm({ termFieldEnabled: false, submittedTerm: "Spring 2026", studentTerm: null })).toBeNull();
  });

  it("caps the term at 40 characters", () => {
    expect(resolvePaymentTerm({ termFieldEnabled: true, submittedTerm: "x".repeat(60), studentTerm: null })).toHaveLength(40);
  });
});

describe("toPaymentWording", () => {
  it.each([
    ["Thank You for Your Gift", "Thank You for Your Payment"],
    ["Recurring Giving Set Up", "Recurring Payments Set Up"],
    ["Make Another Donation", "Make Another Payment"],
    ["Donation Received — Processing", "Payment Received — Processing"],
    ["Donor Information", "Payer Information"],
    ["Completing your gift…", "Completing your payment…"],
    ["Processing donation…", "Processing payment…"],
    ["We couldn’t complete your donation. Please try again.", "We couldn’t complete your payment. Please try again."],
    ["Please choose who this gift is for.", "Please choose who this payment is for."],
    ["Day of the month for future gifts", "Day of the month for future payments"],
    ["Donate with", "Pay with"],
    ["Give anonymously", "Pay anonymously"],
    ["Give $25.00 / monthly", "Pay $25.00 / monthly"],
    ["View my giving", "View my payments"],
    ["Secure Giving", "Secure Payment"],
    ["Create Giving Link", "Create Payment Link"],
    ["Recent Giving Links", "Recent Payment Links"],
    ["No giving links yet.", "No payment links yet."],
    ["Total Donated", "Total Paid"],
    ["Send a giving link to your donor list and see who gave.", "Send a payment link to your payer list and see who paid."],
    ["A donor texts a keyword and gets back a link to give — set up your keywords ahead of launch.", "A payer texts a keyword and gets back a link to pay — set up your keywords ahead of launch."],
    ["sync people and giving records with WGC Payments.", "sync people and payment records with WGC Payments."],
    ["Text to Give", "Text to Pay"],
    ["Used for mailed receipts and annual giving statements.", "Used for mailed receipts and annual payment statements."],
  ])("%s -> %s", (input, expected) => {
    expect(toPaymentWording(input)).toBe(expected);
  });

  it("leaves copy without donation wording untouched, and is safe to apply twice", () => {
    for (const text of ["Payment Was Not Completed", "Phone", "Card number", "$25.00 goes to First Church."]) {
      expect(toPaymentWording(text)).toBe(text);
    }
    expect(toPaymentWording(toPaymentWording("Thank You for Your Gift"))).toBe("Thank You for Your Payment");
  });

  it("only changes whole words", () => {
    expect(toPaymentWording("Giveaway")).toBe("Giveaway");
    expect(toPaymentWording("legitimate")).toBe("legitimate");
  });
});
