import { describe, it, expect } from "vitest";
import React from "react";
import { DonationReceiptPdf, type DonationReceiptPdfProps } from "../DonationReceiptPdf";

// Collects every text node in the element tree the component returns, so we can assert on what a donor would read.
function texts(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((n) => texts(n, out));
    return out;
  }
  if (React.isValidElement(node)) texts((node.props as { children?: unknown }).children, out);
  return out;
}

const base: DonationReceiptPdfProps = {
  organizationName: "Grace Fellowship",
  organizationLogoUrl: null,
  organizationAddress: null,
  organizationEmail: null,
  organizationPhone: null,
  organizationWebsite: null,
  organizationTaxId: null,
  donorName: "Sarah Mitchell",
  donorEmail: null,
  donorAddress: null,
  receiptNumber: "GF-0001",
  transactionReference: "TR1",
  donationDate: new Date("2026-10-10T12:00:00Z"),
  amountCents: 25000,
  fundName: "General",
  paymentMethodLabel: "Bank •••• 4417",
  isRecurring: false,
  recurringInterval: null,
  goodsServicesProvided: false,
  goodsServicesFairMarketValueCents: null,
  recordedContributionAmountCents: null,
  acknowledgmentText: "Thank you",
  disclaimer: "d",
  footer: null,
};

describe("DonationReceiptPdf covered fee", () => {
  it("shows the gift, the covered fee and the total charged as separate lines", () => {
    const t = texts(DonationReceiptPdf({ ...base, donorCoveredFeeCents: 25 }));
    expect(t).toContain("Amount");
    expect(t).toContain("$250.00");
    expect(t).toContain("Processing Fee Covered by Donor");
    expect(t).toContain("$0.25");
    expect(t).toContain("Total Charged");
    expect(t).toContain("$250.25");
  });

  it("shows no fee lines when there is none (the default receipt is unchanged)", () => {
    for (const fee of [undefined, 0]) {
      const t = texts(DonationReceiptPdf({ ...base, donorCoveredFeeCents: fee }));
      expect(t).not.toContain("Processing Fee Covered by Donor");
      expect(t).not.toContain("Total Charged");
      expect(t).toContain("$250.00");
    }
  });
});
