import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { TransactionExportRow, TransactionReportSummary } from "@/lib/exports/transactionExport";

const styles = StyleSheet.create({
  page: { padding: 28, fontSize: 8, fontFamily: "Helvetica" },
  header: { marginBottom: 10, borderBottom: 1, borderBottomColor: "#e2e8f0", paddingBottom: 8 },
  brand: { fontSize: 12, fontWeight: 700, color: "#0f172a" },
  reportTitle: { fontSize: 11, fontWeight: 700, color: "#0f172a", marginTop: 2 },
  headerLine: { fontSize: 8, color: "#475569", marginTop: 1 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 10, marginBottom: 4, color: "#0f172a" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  kpiCard: { width: "20%", padding: 6, marginBottom: 6 },
  kpiLabel: { fontSize: 7, color: "#64748b" },
  kpiValue: { fontSize: 10, fontWeight: 700, color: "#0f172a", marginTop: 2 },
  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f1f5f9", padding: 3, fontWeight: 700 },
  tableRow: { flexDirection: "row", padding: 3, borderBottom: 1, borderBottomColor: "#f1f5f9" },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 6, color: "#94a3b8", lineHeight: 1.3 },
  pageNumber: { position: "absolute", bottom: 16, right: 28, fontSize: 7, color: "#94a3b8" },
  settlementBlock: { marginBottom: 8, padding: 6, backgroundColor: "#f8fafc" },
  settlementTitle: { fontSize: 9, fontWeight: 700, color: "#0f172a", marginBottom: 3 },
});

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Pending";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateStr(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function Header({ rows }: { rows: TransactionExportRow[] }) {
  const first = rows[0];
  if (!first) return null;
  return (
    <View style={styles.header} fixed>
      <Text style={styles.brand}>WGC Payments</Text>
      <Text style={styles.reportTitle}>{first.reportType}</Text>
      <Text style={styles.headerLine}>Organization: {first.organizationName}</Text>
      <Text style={styles.headerLine}>
        {first.reportScope === "ENTIRE_ORGANIZATION" ? "Scope: Entire Organization" : `Report Owner: ${first.reportOwnerName || "—"}`}
      </Text>
      <Text style={styles.headerLine}>
        Period: {first.periodStart ? dateStr(first.periodStart) : "All time"}
        {first.periodEnd ? ` – ${dateStr(first.periodEnd)}` : ""} · Generated: {dateStr(first.generatedAt)} by {first.generatedByName || first.generatedByEmail}
      </Text>
    </View>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kpiCard}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

interface SettlementGroup {
  settlementId: string;
  settlementStatus: string;
  settlementCreatedAt: Date | null;
  settlementProcessedAt: Date | null;
  transactionCount: number;
  grossIncludedCents: number;
  totalFeesCents: number | null;
  refundAdjustmentCents: number;
  disputeAdjustmentCents: number;
  achReturnAdjustmentCents: number;
  allocationTotalCents: number;
  depositId: string;
  depositStatus: string;
  depositInitiatedAt: Date | null;
  depositCompletedAt: Date | null;
  destinationBankLastFour: string;
  traceId: string;
  reconciliationStatus: string;
}

function groupBySettlement(rows: TransactionExportRow[]): SettlementGroup[] {
  const groups = new Map<string, SettlementGroup>();
  for (const r of rows) {
    if (!r.settlementId) continue;
    const g = groups.get(r.settlementId) ?? {
      settlementId: r.settlementId,
      settlementStatus: r.settlementStatus,
      settlementCreatedAt: r.settlementCreatedAt,
      settlementProcessedAt: r.settlementProcessedAt,
      transactionCount: 0,
      grossIncludedCents: 0,
      totalFeesCents: 0,
      refundAdjustmentCents: 0,
      disputeAdjustmentCents: 0,
      achReturnAdjustmentCents: 0,
      allocationTotalCents: 0,
      depositId: r.depositId,
      depositStatus: r.depositStatus,
      depositInitiatedAt: r.depositInitiatedAt,
      depositCompletedAt: r.depositCompletedAt,
      destinationBankLastFour: r.destinationBankLastFour,
      traceId: r.traceId,
      reconciliationStatus: r.reconciliationStatus,
    };
    g.transactionCount += 1;
    g.grossIncludedCents += r.donationAmountCents;
    g.totalFeesCents = g.totalFeesCents === null || r.totalFeesCents === null ? null : g.totalFeesCents + r.totalFeesCents;
    g.refundAdjustmentCents += r.refundAmountCents;
    g.disputeAdjustmentCents += r.disputeAmountCents;
    g.achReturnAdjustmentCents += r.achReturnAmountCents;
    g.allocationTotalCents += r.settlementAllocationAmountCents ?? 0;
    groups.set(r.settlementId, g);
  }
  return [...groups.values()];
}

export interface TransactionReportPdfProps {
  rows: TransactionExportRow[];
  summary: TransactionReportSummary;
}

/**
 * Renders the exact same rows/summary the CSV export produces — see
 * buildTransactionReportData() in transactionReportData.ts, the one shared
 * builder both formats read from. Never recomputes totals independently.
 */
export function TransactionReportPdf({ rows, summary }: TransactionReportPdfProps) {
  const settlementGroups = groupBySettlement(rows);
  const first = rows[0];

  return (
    <Document>
      <Page size="LETTER" orientation="landscape" style={styles.page}>
        <Header rows={rows} />

        {first && (
          <>
            <Text style={styles.headerLine}>
              {first.reportScope === "TEAM_MEMBER" &&
                `Team Member: ${first.reportOwnerName} (${first.reportOwnerEmail}) — ${first.reportOwnerRole}`}
              {first.reportScope === "GIVING_LINK" && `Giving Link: ${first.givingLinkName} (${first.givingLinkId})`}
              {first.reportScope === "DONOR" && `Donor: ${first.donorName}`}
            </Text>
            <Text style={{ ...styles.headerLine, marginBottom: 4 }}>Applied Filters: {first.appliedFilters || "None"}</Text>
          </>
        )}

        <Text style={styles.sectionTitle}>Summary</Text>
        <View style={styles.kpiGrid}>
          <KpiCard label="Total Transactions" value={String(summary.transactionCount)} />
          <KpiCard label="Gross Donation Amount" value={money(summary.grossDonationAmountCents)} />
          <KpiCard label="Donor-Covered Fees" value={money(summary.donorProcessingFeesCents)} />
          <KpiCard label="Total Charged to Donors" value={money(summary.totalChargedToDonorsCents)} />
          <KpiCard label="Finix Processing Fees" value={money(summary.finixProcessingFeesCents)} />
          <KpiCard label="WGC Supplemental Fees" value={money(summary.wgcSupplementalFeesCents)} />
          <KpiCard label="Other Processor Fees" value={money(summary.otherProcessorFeesCents)} />
          <KpiCard label="Total Fees" value={money(summary.totalFeesCents)} />
          <KpiCard label="Refund Amount" value={money(summary.refundAmountCents)} />
          <KpiCard label="Dispute Amount" value={money(summary.disputeAmountCents)} />
          <KpiCard label="ACH Return Amount" value={money(summary.achReturnAmountCents)} />
          <KpiCard label="Expected Net to Organization" value={money(summary.expectedNetToOrganizationCents)} />
          <KpiCard label="Actual Reconciled Net" value={money(summary.actualNetToOrganizationCents)} />
          <KpiCard label="Settlement Allocation Total" value={money(summary.settlementAllocationTotalCents)} />
          <KpiCard label="Unsettled Amount" value={money(summary.unsettledAmountCents)} />
          <KpiCard label="Unmatched Amount" value={money(summary.unmatchedAmountCents)} />
        </View>

        {settlementGroups.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Settlement Summary</Text>
            {settlementGroups.map((g) => (
              <View style={styles.settlementBlock} key={g.settlementId} wrap={false}>
                <Text style={styles.settlementTitle}>Settlement {g.settlementId} · {g.settlementStatus}</Text>
                <Text style={styles.headerLine}>
                  Created {dateStr(g.settlementCreatedAt)} · Processed {dateStr(g.settlementProcessedAt)} · {g.transactionCount} transaction(s)
                </Text>
                <Text style={styles.headerLine}>
                  Gross {money(g.grossIncludedCents)} · Fees {money(g.totalFeesCents)} · Refunds {money(g.refundAdjustmentCents)} · Disputes {money(g.disputeAdjustmentCents)} · ACH Returns {money(g.achReturnAdjustmentCents)} · Allocated {money(g.allocationTotalCents)}
                </Text>
                <Text style={styles.headerLine}>
                  Deposit {g.depositId || "—"} · {g.depositStatus || "—"} · Initiated {dateStr(g.depositInitiatedAt)} · Completed {dateStr(g.depositCompletedAt)} · Bank ····{g.destinationBankLastFour || "----"} · Trace {g.traceId || "—"} · {g.reconciliationStatus}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={styles.sectionTitle}>Transactions</Text>
        <View style={styles.table}>
          <View style={styles.tableHeaderRow} fixed>
            <Text style={{ width: "8%" }}>Date</Text>
            <Text style={{ width: "9%" }}>Donor</Text>
            <Text style={{ width: "9%" }}>Giving Link</Text>
            <Text style={{ width: "9%" }}>Team Member</Text>
            <Text style={{ width: "6%" }}>Method</Text>
            <Text style={{ width: "9%" }}>Transfer ID</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Donation</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Donor Fee</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Total Chg.</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Finix Fee</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Refund</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Exp. Net</Text>
            <Text style={{ width: "6%", textAlign: "right" }}>Act. Net</Text>
            <Text style={{ width: "8%" }}>Settlement</Text>
          </View>
          {rows.map((r) => (
            <View style={styles.tableRow} key={r.wgcPaymentId} wrap={false}>
              <Text style={{ width: "8%" }}>{dateStr(r.createdAt)}</Text>
              <Text style={{ width: "9%" }}>{r.donorName}</Text>
              <Text style={{ width: "9%" }}>{r.givingLinkName || "—"}</Text>
              <Text style={{ width: "9%" }}>{r.teamMemberName || "—"}</Text>
              <Text style={{ width: "6%" }}>{r.paymentMethod}</Text>
              <Text style={{ width: "9%" }}>{r.finixTransferId || "—"}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.donationAmountCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.donorProcessingFeeCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.totalChargedToDonorCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.finixProcessingFeeCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.refundAmountCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.expectedNetToOrganizationCents)}</Text>
              <Text style={{ width: "6%", textAlign: "right" }}>{money(r.actualNetToOrganizationCents)}</Text>
              <Text style={{ width: "8%" }}>{r.settlementIncluded === "YES" ? "Settled" : r.settlementIncluded}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer} fixed>
          This report was generated by WGC Payments for the organization and report scope identified above. Team-member amounts represent WGC
          transaction attribution and do not represent a separate Finix merchant, bank account, or settlement destination. All organization funds
          settle according to the organization's Finix merchant and approved settlement configuration.{"\n"}
          Expected values may differ from actual reconciled values. Empty or pending fields indicate that authoritative processor or settlement
          data was not yet available when the report was generated.
        </Text>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
