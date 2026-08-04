import { describe, it, expect } from "vitest";
import { calculateLineItem, calculateInvoiceTotals, calculateInvoiceBalance } from "../invoiceMoney";

describe("calculateLineItem", () => {
  it("computes gross as quantity * unitPriceCents", () => {
    const result = calculateLineItem({ quantity: 3, unitPriceCents: 1000, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    expect(result.grossCents).toBe(3000);
    expect(result.totalCents).toBe(3000);
  });

  it("applies a fixed discount", () => {
    const result = calculateLineItem({ quantity: 1, unitPriceCents: 1000, discountType: "FIXED", discountValue: 300, taxRateBasisPoints: null });
    expect(result.discountAppliedCents).toBe(300);
    expect(result.totalCents).toBe(700);
  });

  it("never lets a fixed discount exceed the line's gross amount", () => {
    const result = calculateLineItem({ quantity: 1, unitPriceCents: 500, discountType: "FIXED", discountValue: 9999, taxRateBasisPoints: null });
    expect(result.discountAppliedCents).toBe(500);
    expect(result.totalCents).toBe(0);
  });

  it("applies a percentage discount as basis points", () => {
    const result = calculateLineItem({ quantity: 1, unitPriceCents: 10000, discountType: "PERCENTAGE", discountValue: 1000, taxRateBasisPoints: null }); // 10%
    expect(result.discountAppliedCents).toBe(1000);
    expect(result.totalCents).toBe(9000);
  });

  it("computes tax on the post-discount amount", () => {
    const result = calculateLineItem({ quantity: 1, unitPriceCents: 10000, discountType: "FIXED", discountValue: 1000, taxRateBasisPoints: 825 }); // 8.25% on $90
    expect(result.taxAmountCents).toBe(743); // round(9000 * 825/10000) = round(742.5) = 743
    expect(result.totalCents).toBe(9743);
  });

  it("never produces a fractional cent (always rounds)", () => {
    const result = calculateLineItem({ quantity: 3, unitPriceCents: 333, discountType: "PERCENTAGE", discountValue: 333, taxRateBasisPoints: 100 });
    expect(Number.isInteger(result.grossCents)).toBe(true);
    expect(Number.isInteger(result.discountAppliedCents)).toBe(true);
    expect(Number.isInteger(result.taxAmountCents)).toBe(true);
    expect(Number.isInteger(result.totalCents)).toBe(true);
  });

  it("throws on a negative quantity or unit price rather than silently coercing", () => {
    expect(() => calculateLineItem({ quantity: -1, unitPriceCents: 100, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null })).toThrow();
    expect(() => calculateLineItem({ quantity: 1, unitPriceCents: -100, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null })).toThrow();
  });
});

describe("calculateInvoiceTotals", () => {
  it("sums line items into subtotal/discount/tax and computes total", () => {
    const li1 = calculateLineItem({ quantity: 1, unitPriceCents: 10000, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const li2 = calculateLineItem({ quantity: 2, unitPriceCents: 500, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const totals = calculateInvoiceTotals({ lineItems: [li1, li2], invoiceLevelDiscountCents: 0, serviceFeeCents: 0 });
    expect(totals.subtotalCents).toBe(11000);
    expect(totals.totalCents).toBe(11000);
  });

  it("applies an invoice-level discount on top of line-item discounts", () => {
    const li = calculateLineItem({ quantity: 1, unitPriceCents: 10000, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const totals = calculateInvoiceTotals({ lineItems: [li], invoiceLevelDiscountCents: 1000, serviceFeeCents: 0 });
    expect(totals.discountCents).toBe(1000);
    expect(totals.totalCents).toBe(9000);
  });

  it("clamps an invoice-level discount that would exceed the remaining subtotal", () => {
    const li = calculateLineItem({ quantity: 1, unitPriceCents: 1000, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const totals = calculateInvoiceTotals({ lineItems: [li], invoiceLevelDiscountCents: 99999, serviceFeeCents: 0 });
    expect(totals.totalCents).toBe(0);
    expect(totals.discountCents).toBe(1000);
  });

  it("adds the service fee on top of the discounted, taxed total", () => {
    const li = calculateLineItem({ quantity: 1, unitPriceCents: 10000, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const totals = calculateInvoiceTotals({ lineItems: [li], invoiceLevelDiscountCents: 0, serviceFeeCents: 250 });
    expect(totals.totalCents).toBe(10250);
  });

  it("never returns a negative total", () => {
    const li = calculateLineItem({ quantity: 1, unitPriceCents: 100, discountType: "FIXED", discountValue: 0, taxRateBasisPoints: null });
    const totals = calculateInvoiceTotals({ lineItems: [li], invoiceLevelDiscountCents: 99999, serviceFeeCents: 0 });
    expect(totals.totalCents).toBeGreaterThanOrEqual(0);
  });
});

describe("calculateInvoiceBalance", () => {
  it("computes balance as total minus successful payments", () => {
    const result = calculateInvoiceBalance({
      totalCents: 10000,
      payments: [{ status: "SUCCEEDED", netAmountCents: 9700, grossAmountCents: 4000, refundedCents: 0 }],
    });
    expect(result.amountPaidCents).toBe(4000);
    expect(result.balanceCents).toBe(6000);
  });

  it("reaches zero balance when payments cover the full total", () => {
    const result = calculateInvoiceBalance({
      totalCents: 5000,
      payments: [{ status: "SUCCEEDED", netAmountCents: 4850, grossAmountCents: 5000, refundedCents: 0 }],
    });
    expect(result.balanceCents).toBe(0);
  });

  it("excludes PENDING payments from amountPaidCents (ACH not yet settled)", () => {
    const result = calculateInvoiceBalance({
      totalCents: 5000,
      payments: [{ status: "PENDING", netAmountCents: 4850, grossAmountCents: 5000, refundedCents: 0 }],
    });
    expect(result.amountPaidCents).toBe(0);
    expect(result.balanceCents).toBe(5000);
  });

  it("excludes FAILED payments entirely", () => {
    const result = calculateInvoiceBalance({
      totalCents: 5000,
      payments: [{ status: "FAILED", netAmountCents: 4850, grossAmountCents: 5000, refundedCents: 0 }],
    });
    expect(result.amountPaidCents).toBe(0);
  });

  it("a partial refund increases the effective remaining balance", () => {
    const result = calculateInvoiceBalance({
      totalCents: 10000,
      payments: [{ status: "PARTIALLY_REFUNDED", netAmountCents: 4850, grossAmountCents: 10000, refundedCents: 3000 }],
    });
    expect(result.amountPaidCents).toBe(7000);
    expect(result.refundedCents).toBe(3000);
    expect(result.balanceCents).toBe(3000);
  });

  it("a full refund returns the invoice to a full outstanding balance", () => {
    const result = calculateInvoiceBalance({
      totalCents: 10000,
      payments: [{ status: "REFUNDED", netAmountCents: 4850, grossAmountCents: 10000, refundedCents: 10000 }],
    });
    expect(result.amountPaidCents).toBe(0);
    expect(result.balanceCents).toBe(10000);
  });

  it("sums multiple payments across a multi-payment (partial-payment) invoice", () => {
    const result = calculateInvoiceBalance({
      totalCents: 10000,
      payments: [
        { status: "SUCCEEDED", netAmountCents: 2900, grossAmountCents: 3000, refundedCents: 0 },
        { status: "SUCCEEDED", netAmountCents: 6800, grossAmountCents: 7000, refundedCents: 0 },
      ],
    });
    expect(result.amountPaidCents).toBe(10000);
    expect(result.balanceCents).toBe(0);
  });
});
