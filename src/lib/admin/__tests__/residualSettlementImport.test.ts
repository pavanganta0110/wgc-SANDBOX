import { describe, it, expect } from "vitest";
import { detectExportKind, parseBillingTransfersExport, parseMoneyCents, parseResidualSettlementsExport } from "../residualSettlementImport";

// Finix's dashboard export, exactly as pasted from the Residual Settlements list.
const PASTED = [
  "ID\tBilling Window Start\tBilling Window End\tType\tApplication Business Name\tMerchant Fees\tNetwork and Finix Costs\tResidual Subtotal\tRev Share\tTotal Residual\tState",
  "billing_settlement_cF1zq85ZPTjYu4ao6SW1n\t2026-09-01T00:00:00.00Z\t2026-10-01T00:00:00.00Z\tAcquiring\tWaypoint Gateway Collective LLC\t$97.95-USD\t$56.69617-USD\t$41.25383-USD\t100%\t$41.25-USD\tAPPROVED",
  "billing_settlement_cE47w9QeCbDc3uEmXHLrh\t2026-08-01T00:00:00.00Z\t2026-09-01T00:00:00.00Z\tAcquiring\tWaypoint Gateway Collective LLC\t$35.60-USD\t$28.33603-USD\t$7.26397-USD\t100%\t$7.26-USD\tAPPROVED",
  "billing_settlement_cCYvatg7TjSuGWYy6j2x8\t2026-07-01T00:00:00.00Z\t2026-08-01T00:00:00.00Z\tAcquiring\tWaypoint Gateway Collective LLC\t$1.54-USD\t$4.57485-USD\t($3.03485)-USD\t100%\t($3.03)-USD\tAPPROVED",
].join("\n");

describe("parseMoneyCents", () => {
  it("reads Finix's money formats", () => {
    expect(parseMoneyCents("$97.95-USD")).toBe(9795);
    expect(parseMoneyCents("$56.69617-USD")).toBe(5669.617);
    expect(parseMoneyCents("($3.03485)-USD")).toBe(-303.485);
    expect(parseMoneyCents("$1,234.50")).toBe(123450);
    expect(parseMoneyCents("n/a")).toBeNull();
  });
});

describe("parseResidualSettlementsExport", () => {
  it("parses the pasted dashboard table", () => {
    const { rows, errors } = parseResidualSettlementsExport(PASTED);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(3);
    const [sep, , jul] = rows;
    expect(sep).toMatchObject({
      finixBillingSettlementId: "billing_settlement_cF1zq85ZPTjYu4ao6SW1n",
      merchantFeesCents: 9795,
      costsCents: 5669.617,
      totalResidualCents: 4125,
      revSharePercent: 100,
      state: "APPROVED",
      type: "Acquiring",
    });
    expect(sep.windowStart.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(jul.totalResidualCents).toBe(-303);
    expect(jul.residualSubtotalCents).toBe(-303.485);
  });

  it("parses the CSV export, including quoted cells", () => {
    const csv = PASTED.split("\n")
      .map((line) => line.split("\t").map((c) => (c.includes(" ") ? `"${c}"` : c)).join(","))
      .join("\r\n");
    const { rows, errors } = parseResidualSettlementsExport(`﻿${csv}`);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.totalResidualCents)).toEqual([4125, 726, -303]);
  });

  it("rejects text that isn't the export, and skips bad rows with a reason", () => {
    expect(parseResidualSettlementsExport("hello").errors[0]).toMatch(/header row/);
    const bad = PASTED.replace("$35.60-USD", "oops").replace("billing_settlement_cCYvatg7TjSuGWYy6j2x8", "TR123");
    const { rows, errors } = parseResidualSettlementsExport(bad);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
  });
});

// Finix's Billing Transfers export for the August 2026 settlement, as downloaded.
const TRANSFERS_CSV = [
  "id,createdAt,updatedAt,amount,currency,depositType,state,paymentInstrumentId,linkedTo",
  "billing_transfer_cE4moLUyzrwi6GrdGexgq,2026-09-15T01:24:37.72Z,2026-09-15T01:24:37.72Z,7.26,USD,CREDIT,SUCCEEDED,PI639MACzJkiTeauA3Lwh3dG,APjMsw3pEqpcnZ9dT4WYkogp",
].join("\n");

describe("detectExportKind", () => {
  it("tells the two Finix exports apart", () => {
    expect(detectExportKind(PASTED)).toBe("RESIDUAL_SETTLEMENTS");
    expect(detectExportKind(TRANSFERS_CSV)).toBe("BILLING_TRANSFERS");
    expect(detectExportKind("name,amount\nx,1")).toBeNull();
  });
});

describe("parseBillingTransfersExport", () => {
  it("parses the real export", () => {
    const { rows, errors } = parseBillingTransfersExport(TRANSFERS_CSV);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        finixBillingTransferId: "billing_transfer_cE4moLUyzrwi6GrdGexgq",
        createdAtFinix: new Date("2026-09-15T01:24:37.720Z"),
        amountCents: 726,
        currency: "USD",
        depositType: "CREDIT",
        state: "SUCCEEDED",
        paymentInstrumentId: "PI639MACzJkiTeauA3Lwh3dG",
        linkedTo: "APjMsw3pEqpcnZ9dT4WYkogp",
      },
    ]);
  });

  it("skips rows with an unknown deposit type", () => {
    const { rows, errors } = parseBillingTransfersExport(TRANSFERS_CSV.replace(",CREDIT,", ",REFUND,"));
    expect(rows).toEqual([]);
    expect(errors[0]).toMatch(/deposit type/);
  });
});
