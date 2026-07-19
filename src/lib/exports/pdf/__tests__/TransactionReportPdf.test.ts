import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { TransactionReportPdf } from "@/lib/exports/pdf/TransactionReportPdf";
import type { TransactionExportRow, TransactionReportSummary } from "@/lib/exports/transactionExport";

/** Resolves a plain (unrendered) React element tree by hand — no real
 * React/PDF renderer involved, just recursively invoking any function
 * component (Header, KpiCard, KV, ...) to get its returned elements,
 * since this test never mounts through react-dom. Returns the tree with
 * every function component replaced by what it actually returns. */
function resolve(node: any): any {
  if (node === null || node === undefined || typeof node === "boolean" || typeof node === "string" || typeof node === "number") {
    return node;
  }
  if (Array.isArray(node)) return node.map(resolve);
  if (typeof node.type === "function") {
    return resolve(node.type(node.props ?? {}));
  }
  return node;
}

/** Recursively collects every string leaf actually passed into a <Text>
 * node — this is exactly the content react-pdf embeds as visible PDF
 * text, so walking the resolved element tree is a precise (not just
 * approximate) way to assert what will and won't appear on the page. */
function collectTextStrings(node: any, out: string[] = []): string[] {
  const resolved = resolve(node);
  if (resolved === null || resolved === undefined || typeof resolved === "boolean") return out;
  if (typeof resolved === "string" || typeof resolved === "number") {
    out.push(String(resolved));
    return out;
  }
  if (Array.isArray(resolved)) {
    for (const child of resolved) collectTextStrings(child, out);
    return out;
  }
  if (resolved.props?.children !== undefined) {
    collectTextStrings(resolved.props.children, out);
  }
  return out;
}

/** Collects the direct string content of every built-in <Text> element
 * specifically (as opposed to every string anywhere) — used to check
 * that specific header cells are separate Text nodes rather than
 * concatenated into one string. react-pdf's Text primitive has
 * displayName "Text" once resolved. */
function collectTextNodeContents(node: any, out: string[] = []): string[] {
  const resolved = resolve(node);
  if (resolved === null || resolved === undefined || typeof resolved === "boolean") return out;
  if (Array.isArray(resolved)) {
    for (const child of resolved) collectTextNodeContents(child, out);
    return out;
  }
  // react-pdf's host components (Text, View, ...) are plain string tags
  // in its custom reconciler ("TEXT", "VIEW", ...), not React function/
  // class components — unlike react-dom's lowercase-string convention.
  if (resolved.type === "TEXT") {
    out.push(collectTextStrings(resolved.props?.children).join(""));
    return out;
  }
  if (resolved.props?.children !== undefined) {
    collectTextNodeContents(resolved.props.children, out);
  }
  return out;
}

const FULL_TRANSFER_ID = "TRacEgwi8kWcXvQsMqKbAfaNCompleteAndUnbroken";

function makeRow(overrides: Partial<TransactionExportRow> = {}): TransactionExportRow {
  return {
    reportType: "Team Member Transaction and Settlement Report",
    reportScope: "TEAM_MEMBER",
    reportOwnerName: "fund@church-a.com",
    reportOwnerEmail: "fund@church-a.com",
    reportOwnerUserId: "u1",
    reportOwnerRole: "fundraiser",
    generatedByName: "owner@church-a.com",
    generatedByEmail: "owner@church-a.com",
    generatedAt: new Date("2026-07-19"),
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
    appliedFilters: "Team Member = fund@church-a.com",
    organizationName: "Ganta Holdings",
    organizationId: "church-a",
    teamMemberName: "fund@church-a.com",
    teamMemberEmail: "fund@church-a.com",
    givingLinkName: "Spring Drive",
    givingLinkId: "link-1",
    wgcPaymentId: "p1",
    finixTransferId: FULL_TRANSFER_ID,
    createdAt: new Date("2026-07-19"),
    currency: "USD",
    donorName: "Jane Doe",
    donorEmail: "jane@x.com",
    donorPhone: "",
    paymentMethod: "GOOGLE_PAY",
    instrumentType: "",
    cardBrandOrBankType: "",
    lastFour: "",
    transactionStatus: "SUCCEEDED",
    refundStatus: "NONE",
    disputeStatus: "NONE",
    achReturnStatus: "NONE",
    donationAmountCents: 5000,
    donorProcessingFeeCents: 150,
    totalChargedToDonorCents: 5150,
    finixProcessingFeeCents: 175,
    wgcSupplementalFeeCents: null,
    otherProcessorFeesCents: 0,
    totalFeesCents: 175,
    refundAmountCents: 0,
    disputeAmountCents: 0,
    achReturnAmountCents: 0,
    expectedNetToOrganizationCents: 5000,
    actualNetToOrganizationCents: 4825,
    settlementIncluded: "NO",
    settlementAllocationAmountCents: null,
    settlementId: "",
    settlementStatus: "NOT_SETTLED",
    settlementCreatedAt: null,
    settlementProcessedAt: null,
    depositId: "",
    depositStatus: "",
    depositInitiatedAt: null,
    depositCompletedAt: null,
    destinationBankLastFour: "",
    traceId: "",
    reconciliationStatus: "NOT_SETTLED",
    dataNotes: "",
    ...overrides,
  };
}

const emptySummary: TransactionReportSummary = {
  transactionCount: 1,
  grossDonationAmountCents: 5000,
  donorProcessingFeesCents: 150,
  totalChargedToDonorsCents: 5150,
  finixProcessingFeesCents: 175,
  wgcSupplementalFeesCents: null,
  otherProcessorFeesCents: 0,
  totalFeesCents: 175,
  refundAmountCents: 0,
  disputeAmountCents: 0,
  achReturnAmountCents: 0,
  expectedNetToOrganizationCents: 5000,
  actualNetToOrganizationCents: 4825,
  settlementAllocationTotalCents: 0,
  unsettledAmountCents: 5000,
  unmatchedAmountCents: 0,
};

describe("TransactionReportPdf — branding", () => {
  it("contains no visible 'Finix' text anywhere in the element tree", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const allText = collectTextStrings(element).join(" ");
    expect(allText).not.toMatch(/finix/i);
  });

  it("uses 'Processor Fees' instead of 'Finix Processing Fees' in the summary", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const allText = collectTextStrings(element).join(" | ");
    expect(allText).toContain("Processor Fees");
    expect(allText).not.toContain("Finix Processing Fees");
  });

  it("uses 'Processor Transaction ID' instead of 'Finix Transfer ID' as a column header", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const allText = collectTextStrings(element).join(" | ");
    expect(allText).toContain("Processor Transaction ID");
    expect(allText).not.toContain("Finix Transfer ID");
  });

  it("footer text contains no processor brand name", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const allText = collectTextStrings(element).join(" ");
    expect(allText.toLowerCase()).not.toContain("finix");
    expect(allText).toContain("do not represent a separate merchant account");
    expect(allText).toContain("confirmed payment or settlement information");
  });
});

describe("TransactionReportPdf — table layout", () => {
  it("renders Transaction Summary and Fees and Settlement Details as two separate table sections", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const allText = collectTextStrings(element).join(" | ");
    expect(allText).toContain("Transaction Summary");
    expect(allText).toContain("Fees and Settlement Details");
  });

  it("Payment Method and Processor Transaction ID are separate header cells, not merged into one string", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const cells = collectTextNodeContents(element);
    expect(cells).toContain("Payment Method");
    expect(cells).toContain("Processor Transaction ID");
    // Neither header cell's own text contains the other's label glued together.
    expect(cells.some((c) => c.includes("Payment MethodProcessor"))).toBe(false);
  });

  it("Actual Net and Settlement Included are separate header cells", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const cells = collectTextNodeContents(element);
    expect(cells).toContain("Actual Net");
    expect(cells).toContain("Settlement Included");
    expect(cells.some((c) => c.includes("Actual NetSettlement"))).toBe(false);
  });

  it("the complete Processor Transaction ID is present, never truncated", () => {
    const element = TransactionReportPdf({ rows: [makeRow()], summary: emptySummary });
    const cells = collectTextNodeContents(element);
    expect(cells).toContain(FULL_TRANSFER_ID);
  });

  it("Team Member name and email render as separate Text nodes when they differ (never concatenated)", () => {
    const element = TransactionReportPdf({
      rows: [makeRow({ teamMemberName: "Pavan Ganta", teamMemberEmail: "pavankumarreddi2@gmail.com" })],
      summary: emptySummary,
    });
    const cells = collectTextNodeContents(element);
    expect(cells).toContain("Pavan Ganta");
    expect(cells).toContain("pavankumarreddi2@gmail.com");
    expect(cells.some((c) => c === "Pavan Gantapavankumarreddi2@gmail.com")).toBe(false);
  });
});

describe("TransactionReportPdf — report owner and settlement display", () => {
  it("prefers the report owner's display name over their email in the header", () => {
    const element = TransactionReportPdf({
      rows: [makeRow({ reportOwnerName: "Pavan Ganta", reportOwnerEmail: "pavankumarreddi2@gmail.com" })],
      summary: emptySummary,
    });
    const cells = collectTextNodeContents(element);
    expect(cells).toContain("Report Owner: Pavan Ganta");
    expect(cells).not.toContain("Report Owner: pavankumarreddi2@gmail.com");
  });

  it("shows 'Entire Organization' as the report owner for organization scope, never the exporting admin", () => {
    const element = TransactionReportPdf({
      rows: [makeRow({ reportScope: "ENTIRE_ORGANIZATION", reportOwnerName: "Entire Organization", reportOwnerEmail: "" })],
      summary: emptySummary,
    });
    const allText = collectTextStrings(element).join(" | ");
    expect(allText).toContain("Report Owner: Entire Organization");
  });

  it("shows 'Unavailable' for a settled transaction with no destination bank last four, never a placeholder like 'Bank ····----'", () => {
    const element = TransactionReportPdf({
      rows: [
        makeRow({
          settlementId: "stl-1",
          settlementStatus: "SUCCEEDED",
          settlementIncluded: "YES",
          destinationBankLastFour: "",
        }),
      ],
      summary: emptySummary,
    });
    const allText = collectTextStrings(element).join(" | ");
    expect(allText).toContain("Destination Account");
    expect(allText).toContain("Unavailable");
    expect(allText).not.toMatch(/Bank ·+-+/);
  });
});

describe("TransactionReportPdf — rendering", () => {
  it("renders to a non-empty PDF buffer without throwing for a multi-row, multi-settlement fixture", async () => {
    const rows = [
      makeRow(),
      makeRow({
        wgcPaymentId: "p2",
        finixTransferId: "tr-2",
        settlementId: "stl-1",
        settlementStatus: "SUCCEEDED",
        settlementIncluded: "YES",
        settlementAllocationAmountCents: 5000,
        settlementCreatedAt: new Date("2026-07-10"),
        settlementProcessedAt: new Date("2026-07-12"),
        depositId: "fta-1",
        depositStatus: "PAID",
        depositCompletedAt: new Date("2026-07-13"),
        destinationBankLastFour: "4321",
        reconciliationStatus: "RECONCILED",
      }),
    ];
    const buffer = await renderToBuffer(TransactionReportPdf({ rows, summary: emptySummary }) as any);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
