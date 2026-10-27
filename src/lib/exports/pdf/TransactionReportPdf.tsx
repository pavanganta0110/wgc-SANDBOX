import { Document, Page, Text, View, StyleSheet, Font, Image } from "@react-pdf/renderer";
import type { TransactionExportRow, TransactionReportSummary } from "@/lib/exports/transactionExport";
import type { OrganizationBranding } from "@/lib/exports/organizationBranding";
import type { PdfSectionKey } from "@/lib/exports/transactionExportOptions";

// react-pdf hyphenates any word that doesn't fit its remaining line width
// by default (e.g. "Completed" -> "Com-" / "pleted") — exactly the kind of
// mid-word cut this report must never produce, for headers as much as for
// transaction IDs. Wrapping only ever breaks at spaces from here on.
Font.registerHyphenationCallback((word) => [word]);

// Table B (Fees and Settlement Details) needs 14 columns at their
// spec-minimum widths (~1030pt) — no US Letter/Legal landscape page is
// wide enough for that without shrinking columns below their minimums,
// which is exactly what caused the original overlap/merge bug. TABLOID
// landscape (1224pt wide) is the smallest standard @react-pdf/renderer
// page size that fits Table B with real margins, so it's used here
// instead of a bespoke page size.
const PAGE_SIZE = "TABLOID";
const PAGE_MARGIN = 28;

// An email address has no spaces, so react-pdf can never wrap it and a long
// one spills into the next column. Break it before the "@" ourselves.
function splitEmail(email: string | null | undefined): string[] {
  if (!email) return [];
  const at = email.indexOf("@");
  return at > 0 ? [email.slice(0, at), email.slice(at)] : [email];
}

// react-pdf only wraps at spaces, so a single very long word (no spaces)
// would run into the next column. Break such words into column-sized chunks;
// ordinary text is returned untouched.
function breakLongWords(text: string | null | undefined, maxChars: number): string {
  if (!text) return "";
  return text
    .split(" ")
    .map((word) => (word.length > maxChars ? (word.match(new RegExp(`.{1,${maxChars}}`, "g")) ?? [word]).join("\n") : word))
    .join(" ");
}

const A = {
  date: 60,
  donor: 105,
  givingLink: 105,
  fund: 100,
  teamMember: 160,
  method: 85,
  txnId: 205,
  donation: 66,
  donorFee: 66,
  totalCharged: 70,
  status: 78,
};

const B = {
  txnId: 205,
  processorFee: 62,
  totalFees: 62,
  refund: 62,
  expectedNet: 65,
  actualNet: 65,
  settlementIncluded: 58,
  settlementAllocation: 65,
  settlementId: 115,
  settlementProcessed: 65,
  depositStatus: 55,
  depositCompleted: 76,
  reconciliation: 154,
};

const styles = StyleSheet.create({
  page: { padding: PAGE_MARGIN, paddingBottom: 76, fontSize: 8, fontFamily: "Helvetica" },
  header: { marginBottom: 10, borderBottom: 1, borderBottomColor: "#e2e8f0", paddingBottom: 8 },
  orgRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  orgLogo: { width: 40, height: 40, objectFit: "contain", marginRight: 10 },
  orgName: { fontSize: 13, fontWeight: 700, color: "#0f172a" },
  orgLine: { fontSize: 8, color: "#64748b", marginTop: 1 },
  poweredBy: { fontSize: 7, color: "#cbd5e1", marginTop: 2 },
  reportTitle: { fontSize: 11, fontWeight: 700, color: "#0f172a", marginTop: 2 },
  headerLine: { fontSize: 8, color: "#475569", marginTop: 1 },
  sectionTitle: { fontSize: 10, fontWeight: 700, marginTop: 10, marginBottom: 4, color: "#0f172a" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  kpiCard: { width: "16.6%", padding: 6, marginBottom: 6 },
  kpiLabel: { fontSize: 7, color: "#64748b" },
  kpiValue: { fontSize: 10, fontWeight: 700, color: "#0f172a", marginTop: 2 },
  table: { marginTop: 4 },
  tableHeaderRow: { flexDirection: "row", backgroundColor: "#f1f5f9", fontWeight: 700, alignItems: "flex-start" },
  tableRow: { flexDirection: "row", borderBottom: 1, borderBottomColor: "#f1f5f9", alignItems: "flex-start" },
  cell: { paddingHorizontal: 5, paddingVertical: 4 },
  cellMono: { paddingHorizontal: 5, paddingVertical: 4, fontFamily: "Courier", fontSize: 7.5 },
  cellRight: { paddingHorizontal: 5, paddingVertical: 4, textAlign: "right" },
  cellSub: { fontSize: 6.5, color: "#64748b", marginTop: 1 },
  footer: { position: "absolute", bottom: 20, left: PAGE_MARGIN, right: PAGE_MARGIN, fontSize: 8, color: "#94a3b8", lineHeight: 1.4 },
  footerPara: { marginBottom: 4 },
  pageNumber: { position: "absolute", bottom: 20, right: PAGE_MARGIN, fontSize: 8, color: "#94a3b8" },
  settlementBlock: { marginBottom: 10, padding: 8, backgroundColor: "#f8fafc" },
  settlementTitle: { fontSize: 9, fontWeight: 700, color: "#0f172a", marginBottom: 4 },
  kvGrid: { flexDirection: "row", flexWrap: "wrap" },
  kv: { width: "20%", marginBottom: 5, paddingRight: 6 },
  kvLabel: { fontSize: 6.5, color: "#64748b" },
  kvValue: { fontSize: 8, fontWeight: 700, color: "#0f172a", marginTop: 1 },
});

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "Pending";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function dateStr(d: Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function dateOrPending(d: Date | null | undefined): string {
  return d ? dateStr(d) : "Pending";
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

/** The organization's own branding leads the report; WGC appears only as a small "Powered by" line in the footer. */
function Header({ rows, branding }: { rows: TransactionExportRow[]; branding: OrganizationBranding | null }) {
  const first = rows[0];
  if (!first) return null;
  return (
    <View style={styles.header} fixed>
      <View style={styles.orgRow}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- @react-pdf Image has no alt; this is a PDF, not HTML */}
        {branding?.logo && <Image src={branding.logo} style={styles.orgLogo} />}
        <View>
          <Text style={styles.orgName}>{branding?.name || first.organizationName}</Text>
          {branding?.address && <Text style={styles.orgLine}>{branding.address}</Text>}
          {branding?.contact && <Text style={styles.orgLine}>{branding.contact}</Text>}
        </View>
      </View>
      <Text style={styles.reportTitle}>{first.reportType}</Text>
      {first.reportScope === "ENTIRE_ORGANIZATION" ? (
        <Text style={styles.headerLine}>Report Owner: Entire Organization</Text>
      ) : (
        <>
          {/* Report Owner shows the display name; User has no separate
           * name field in this schema (only email), so name and email
           * are currently always identical — the email line is only
           * repeated below when they genuinely differ, per spec. */}
          <Text style={styles.headerLine}>Report Owner: {first.reportOwnerName || "—"}</Text>
          {first.reportOwnerEmail && (
            <Text style={styles.headerLine}>Report Owner Email: {first.reportOwnerEmail}</Text>
          )}
          {first.reportOwnerRole && <Text style={styles.headerLine}>Role: {first.reportOwnerRole}</Text>}
        </>
      )}
      <Text style={styles.headerLine}>
        Reporting Period: {first.periodStart ? dateStr(first.periodStart) : "All time"}
        {first.periodEnd ? ` – ${dateStr(first.periodEnd)}` : ""} · Generated: {dateStr(first.generatedAt)} by {first.generatedByName || first.generatedByEmail}
      </Text>
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
  /** Organization name/logo/address shown at the top. */
  branding?: OrganizationBranding | null;
  /** Sections chosen in the export dialog; null/undefined = all. */
  sections?: PdfSectionKey[] | null;
}

/**
 * Renders the exact same rows/summary the CSV export produces — see
 * buildTransactionReportData() in transactionReportData.ts, the one shared
 * builder both formats read from. Never recomputes totals independently.
 *
 * Split into two linked tables (Transaction Summary / Fees and Settlement
 * Details) joined by Processor Transaction ID, rather than one table with
 * every column — 24 columns of financial/settlement data never fit
 * legibly on a single line at a readable font size.
 */
export function TransactionReportPdf({ rows, summary, branding = null, sections = null }: TransactionReportPdfProps) {
  const settlementGroups = groupBySettlement(rows);
  const first = rows[0];
  const show = (k: PdfSectionKey) => !sections || sections.includes(k);
  const showSummary = show("summary");
  const showSettlements = show("settlements") && settlementGroups.length > 0;
  const showTransactions = show("transactions");
  const showFees = show("fees");

  return (
    <Document>
      <Page size={PAGE_SIZE} orientation="landscape" style={styles.page}>
        <Header rows={rows} branding={branding} />

        {first && (
          <>
            <Text style={styles.headerLine}>
              {first.reportScope === "TEAM_MEMBER" && `Scope: Transactions and giving links attributed to this team member`}
              {first.reportScope === "MY_ACTIVITY" && `Scope: Your own attributed transactions`}
              {first.reportScope === "GIVING_LINK" && `Giving Link: ${first.givingLinkName} (${first.givingLinkId})`}
              {first.reportScope === "DONOR" && `Donor: ${first.donorName}`}
              {first.reportScope === "ENTIRE_ORGANIZATION" && `Scope: All organization transactions`}
            </Text>
            <Text style={{ ...styles.headerLine, marginBottom: 4 }}>Applied Filters: {first.appliedFilters || "None"}</Text>
          </>
        )}

        {showSummary && (
          <>
            <Text style={styles.sectionTitle}>Summary</Text>
            <View style={styles.kpiGrid}>
              <KpiCard label="Total Transactions" value={String(summary.transactionCount)} />
              <KpiCard label="Gross Donation Amount" value={money(summary.grossDonationAmountCents)} />
              <KpiCard label="Donor-Covered Fees" value={money(summary.donorProcessingFeesCents)} />
              <KpiCard label="Total Charged to Donors" value={money(summary.totalChargedToDonorsCents)} />
              <KpiCard label="Processor Fees" value={money(summary.finixProcessingFeesCents)} />
              <KpiCard label="Other Processing Fees" value={money(summary.otherProcessorFeesCents)} />
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
          </>
        )}

        {showSettlements && (
          <>
            <Text style={styles.sectionTitle}>Settlement Summary</Text>
            {settlementGroups.map((g) => (
              <View style={styles.settlementBlock} key={g.settlementId} wrap={false}>
                <Text style={styles.settlementTitle}>Settlement {g.settlementId}</Text>
                <View style={styles.kvGrid}>
                  <KV label="Status" value={g.settlementStatus || "Unknown"} />
                  <KV label="Created" value={dateOrPending(g.settlementCreatedAt)} />
                  <KV label="Processed" value={dateOrPending(g.settlementProcessedAt)} />
                  <KV label="Included Transactions" value={String(g.transactionCount)} />
                  <KV label="Gross Included" value={money(g.grossIncludedCents)} />
                  <KV label="Fees" value={money(g.totalFeesCents)} />
                  <KV label="Allocated" value={money(g.allocationTotalCents)} />
                  <KV label="Deposit ID" value={g.depositId || "—"} />
                  <KV label="Deposit Status" value={g.depositStatus || "Pending"} />
                  <KV label="Deposit Completed" value={dateOrPending(g.depositCompletedAt)} />
                  <KV label="Destination Account" value={g.destinationBankLastFour ? `Ending in ${g.destinationBankLastFour}` : "Unavailable"} />
                  <KV label="Trace ID" value={g.traceId || "—"} />
                  <KV label="Reconciliation" value={g.reconciliationStatus} />
                </View>
              </View>
            ))}
          </>
        )}

        {showTransactions && (
          <>
            <Text style={styles.sectionTitle} break={showSummary || showSettlements}>Transaction Summary</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} fixed>
                <Text style={{ width: A.date, ...styles.cell }}>Date</Text>
                <Text style={{ width: A.donor, ...styles.cell }}>Donor</Text>
                <Text style={{ width: A.givingLink, ...styles.cell }}>Giving Link</Text>
                <Text style={{ width: A.fund, ...styles.cell }}>Fund / Designation</Text>
                <Text style={{ width: A.teamMember, ...styles.cell }}>Team Member</Text>
                <Text style={{ width: A.method, ...styles.cell }}>Payment Method</Text>
                <Text style={{ width: A.txnId, ...styles.cell }}>Processor Transaction ID</Text>
                <Text style={{ width: A.donation, ...styles.cellRight }}>Donation</Text>
                <Text style={{ width: A.donorFee, ...styles.cellRight }}>Donor Fee</Text>
                <Text style={{ width: A.totalCharged, ...styles.cellRight }}>Total Charged</Text>
                <Text style={{ width: A.status, ...styles.cell }}>Status</Text>
              </View>
              {rows.map((r) => {
                const showEmailLine = Boolean(r.teamMemberEmail) && r.teamMemberEmail !== r.teamMemberName;
                return (
                  <View style={styles.tableRow} key={r.wgcPaymentId} wrap={false}>
                    <Text style={{ width: A.date, ...styles.cell }}>{dateStr(r.createdAt)}</Text>
                    <Text style={{ width: A.donor, ...styles.cell }}>{breakLongWords(r.donorName, 17)}</Text>
                    <Text style={{ width: A.givingLink, ...styles.cell }}>{breakLongWords(r.givingLinkName, 17) || "—"}</Text>
                    <Text style={{ width: A.fund, ...styles.cell }}>{breakLongWords(r.fundName, 16) || "Unspecified"}</Text>
                    <View style={{ width: A.teamMember, ...styles.cell }}>
                      <Text>{r.teamMemberName || "—"}</Text>
                      {showEmailLine && splitEmail(r.teamMemberEmail).map((line, i) => (
                        <Text key={i} style={styles.cellSub}>{line}</Text>
                      ))}
                    </View>
                    <Text style={{ width: A.method, ...styles.cell }}>{(r.paymentMethod ?? "").replace(/_/g, " ")}</Text>
                    <Text style={{ width: A.txnId, ...styles.cellMono }}>{r.finixTransferId || "—"}</Text>
                    <Text style={{ width: A.donation, ...styles.cellRight }}>{money(r.donationAmountCents)}</Text>
                    <Text style={{ width: A.donorFee, ...styles.cellRight }}>{money(r.donorProcessingFeeCents)}</Text>
                    <Text style={{ width: A.totalCharged, ...styles.cellRight }}>{money(r.totalChargedToDonorCents)}</Text>
                    <Text style={{ width: A.status, ...styles.cell }}>{r.transactionStatus}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {showFees && (
          <>
            <Text style={styles.sectionTitle} break={showSummary || showSettlements || showTransactions}>Fees and Settlement Details</Text>
            <Text style={{ ...styles.headerLine, marginBottom: 4 }}>{showTransactions ? "Use Processor Transaction ID to match each row back to its Transaction Summary row above." : "Each row is one gift, identified by its Processor Transaction ID."}</Text>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow} fixed>
                <Text style={{ width: B.txnId, ...styles.cell }}>Processor Transaction ID</Text>
                <Text style={{ width: B.processorFee, ...styles.cellRight }}>Processor Fees</Text>
                <Text style={{ width: B.totalFees, ...styles.cellRight }}>Total Fees</Text>
                <Text style={{ width: B.refund, ...styles.cellRight }}>Refund</Text>
                <Text style={{ width: B.expectedNet, ...styles.cellRight }}>Expected Net</Text>
                <Text style={{ width: B.actualNet, ...styles.cellRight }}>Actual Net</Text>
                <Text style={{ width: B.settlementIncluded, ...styles.cell }}>Settlement Included</Text>
                <Text style={{ width: B.settlementAllocation, ...styles.cellRight }}>Settlement Allocation</Text>
                <Text style={{ width: B.settlementId, ...styles.cell }}>Settlement ID</Text>
                <Text style={{ width: B.settlementProcessed, ...styles.cell }}>Settlement Processed</Text>
                <Text style={{ width: B.depositStatus, ...styles.cell }}>Deposit Status</Text>
                <Text style={{ width: B.depositCompleted, ...styles.cell }}>Deposit Completed</Text>
                <Text style={{ width: B.reconciliation, ...styles.cell }}>Reconciliation Status</Text>
              </View>
              {rows.map((r) => (
                <View style={styles.tableRow} key={r.wgcPaymentId} wrap={false}>
                  <Text style={{ width: B.txnId, ...styles.cellMono }}>{r.finixTransferId || "—"}</Text>
                  <Text style={{ width: B.processorFee, ...styles.cellRight }}>{money(r.finixProcessingFeeCents)}</Text>
                  <Text style={{ width: B.totalFees, ...styles.cellRight }}>{money(r.totalFeesCents)}</Text>
                  <Text style={{ width: B.refund, ...styles.cellRight }}>{money(r.refundAmountCents)}</Text>
                  <Text style={{ width: B.expectedNet, ...styles.cellRight }}>{money(r.expectedNetToOrganizationCents)}</Text>
                  <Text style={{ width: B.actualNet, ...styles.cellRight }}>{money(r.actualNetToOrganizationCents)}</Text>
                  <Text style={{ width: B.settlementIncluded, ...styles.cell }}>{r.settlementIncluded}</Text>
                  <Text style={{ width: B.settlementAllocation, ...styles.cellRight }}>{money(r.settlementAllocationAmountCents)}</Text>
                  <Text style={{ width: B.settlementId, ...styles.cellMono }}>{r.settlementId || "—"}</Text>
                  <Text style={{ width: B.settlementProcessed, ...styles.cell }}>{dateOrPending(r.settlementProcessedAt)}</Text>
                  <Text style={{ width: B.depositStatus, ...styles.cell }}>{r.depositStatus || "Pending"}</Text>
                  <Text style={{ width: B.depositCompleted, ...styles.cell }}>{dateOrPending(r.depositCompletedAt)}</Text>
                  <Text style={{ width: B.reconciliation, ...styles.cell }}>{r.reconciliationStatus}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerPara}>
            This report was generated for the organization and report scope identified above. Team-member amounts represent
            transaction attribution and do not represent a separate merchant account, bank account, or settlement destination.
          </Text>
          <Text>
            Expected values may differ from actual reconciled values. Pending or empty fields indicate that confirmed payment or settlement
            information was unavailable when this report was generated.
          </Text>
          <Text style={styles.poweredBy}>Powered by WGC Payments</Text>
        </View>
        <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} fixed />
      </Page>
    </Document>
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
