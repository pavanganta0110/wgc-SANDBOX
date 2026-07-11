import { describe, it, expect } from "vitest";
import { computeReconciliation } from "@/lib/finix/settlementReconciliation";

describe("computeReconciliation", () => {
  it("computes calculatedNet as gross minus fees, refunds, returns, and disputes", () => {
    const result = computeReconciliation({
      totalAmountCents: 10000,
      netAmountCents: 9200,
      feeAmountCents: 300,
      refundAmountCents: 200,
      returnAmountCents: 100,
      disputeAmountCents: 150,
    });

    // 10000 - 300 - 200 - 100 - 150 = 9250
    expect(result.calculatedNetCents).toBe(9250);
    expect(result.processorNetCents).toBe(9200);
    // difference = calculated - processor = 9250 - 9200 = 50
    expect(result.differenceCents).toBe(50);
  });

  it("treats missing component amounts as zero rather than throwing", () => {
    const result = computeReconciliation({
      totalAmountCents: 5000,
      netAmountCents: 5000,
      feeAmountCents: null,
      refundAmountCents: null,
      returnAmountCents: null,
      disputeAmountCents: null,
    });

    expect(result.calculatedNetCents).toBe(5000);
    expect(result.differenceCents).toBe(0);
  });

  it("returns a null difference when the processor hasn't reported a net amount yet", () => {
    const result = computeReconciliation({
      totalAmountCents: 5000,
      netAmountCents: null,
      feeAmountCents: 100,
      refundAmountCents: 0,
      returnAmountCents: 0,
      disputeAmountCents: 0,
    });

    expect(result.processorNetCents).toBeNull();
    expect(result.differenceCents).toBeNull();
    // calculatedNetCents is still computed even without a processor net to compare against
    expect(result.calculatedNetCents).toBe(4900);
  });

  it("reports zero difference when the calculated net exactly matches the processor net", () => {
    const result = computeReconciliation({
      totalAmountCents: 10000,
      netAmountCents: 9700,
      feeAmountCents: 300,
      refundAmountCents: 0,
      returnAmountCents: 0,
      disputeAmountCents: 0,
    });

    expect(result.differenceCents).toBe(0);
  });
});
