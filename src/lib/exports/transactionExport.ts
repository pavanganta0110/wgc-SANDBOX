import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";
import { resolveDisputeDisplayStatus, type DisputeStatusInput } from "@/lib/finix/disputeStatus";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";

// ─────────────────────────────────────────────────────────────────────────
// Canonical transaction-export schema — the single row shape every
// payment-based CSV/PDF export in the app must produce. Do not add a
// route-specific column list anywhere else; every export route calls
// resolveTransactionExportRows() below and renders the result with
// renderTransactionCsv() (or the PDF renderer), so "the only difference
// between export routes is the server-side filter" as specified.
// ─────────────────────────────────────────────────────────────────────────

export type NormalizedPaymentMethod = "CARD" | "ACH" | "APPLE_PAY" | "GOOGLE_PAY" | "UNKNOWN";
export type NormalizedTransactionStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "UNKNOWN";
export type NormalizedRefundStatus = "NONE" | "PENDING" | "PARTIALLY_REFUNDED" | "REFUNDED" | "REFUND_FAILED";
export type NormalizedAchReturnStatus = "NONE" | "RETURNED";
export type NormalizedSettlementStatus = "NOT_SETTLED" | "PENDING" | "SUCCEEDED" | "FAILED" | "UNKNOWN";
export type SettlementIncluded = "YES" | "NO" | "PARTIAL" | "UNMATCHED";
export type ReconciliationStatus =
  | "NOT_SETTLED"
  | "PENDING_SETTLEMENT"
  | "SETTLEMENT_MATCHED"
  | "DEPOSIT_PENDING"
  | "DEPOSIT_COMPLETED"
  | "DEPOSIT_FAILED"
  | "PARTIALLY_RECONCILED"
  | "RECONCILED"
  | "UNMATCHED";

export interface ReportMetadata {
  reportType: string;
  reportScope: string;
  ownerName: string;
  ownerEmail: string;
  ownerUserId: string;
  ownerRole: string;
  generatedByName: string;
  generatedByEmail: string;
  generatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  appliedFilters: string;
}

export interface TransactionExportRow {
  // Report identity (repeated on every row — see section 22 of the spec:
  // CSVs get forwarded/renamed/combined, so each row must self-identify).
  reportType: string;
  reportScope: string;
  reportOwnerName: string;
  reportOwnerEmail: string;
  reportOwnerUserId: string;
  reportOwnerRole: string;
  generatedByName: string;
  generatedByEmail: string;
  generatedAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
  appliedFilters: string;

  organizationName: string;
  organizationId: string;
  teamMemberName: string;
  teamMemberEmail: string;
  givingLinkName: string;
  givingLinkId: string;
  wgcPaymentId: string;
  finixTransferId: string;
  createdAt: Date;
  currency: string;
  donorName: string;
  donorEmail: string;
  donorPhone: string;
  paymentMethod: NormalizedPaymentMethod;
  instrumentType: string;
  cardBrandOrBankType: string;
  lastFour: string;
  transactionStatus: NormalizedTransactionStatus;
  refundStatus: NormalizedRefundStatus;
  disputeStatus: string;
  achReturnStatus: NormalizedAchReturnStatus;
  donationAmountCents: number;
  donorProcessingFeeCents: number;
  totalChargedToDonorCents: number;
  finixProcessingFeeCents: number | null;
  wgcSupplementalFeeCents: number | null;
  otherProcessorFeesCents: number;
  totalFeesCents: number | null;
  refundAmountCents: number;
  disputeAmountCents: number;
  achReturnAmountCents: number;
  expectedNetToOrganizationCents: number | null;
  actualNetToOrganizationCents: number | null;
  settlementIncluded: SettlementIncluded;
  settlementAllocationAmountCents: number | null;
  settlementId: string;
  settlementStatus: string;
  settlementCreatedAt: Date | null;
  settlementProcessedAt: Date | null;
  depositId: string;
  depositStatus: string;
  depositInitiatedAt: Date | null;
  depositCompletedAt: Date | null;
  destinationBankLastFour: string;
  traceId: string;
  reconciliationStatus: ReconciliationStatus;
  dataNotes: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting / normalization helpers
// ─────────────────────────────────────────────────────────────────────────

/** Machine-readable decimal, two places, no currency symbol/separators.
 * Empty string (never "0.00") when the value is genuinely unknown — 0.00
 * means a verified zero, per the spec's explicit "don't invent zero" rule. */
export function formatMoneyOrEmpty(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function formatIsoOrEmpty(date: Date | null | undefined): string {
  return date ? date.toISOString() : "";
}

export function normalizePaymentMethod(rawPaymentMethodType: string | null | undefined): NormalizedPaymentMethod {
  const v = (rawPaymentMethodType || "").toUpperCase();
  if (v === "APPLE_PAY") return "APPLE_PAY";
  if (v === "GOOGLE_PAY") return "GOOGLE_PAY";
  if (v === "PAYMENT_CARD" || v === "CARD") return "CARD";
  if (v === "BANK_ACCOUNT" || v === "ACH") return "ACH";
  return "UNKNOWN";
}

export function normalizeTransactionStatus(rawStatus: string | null | undefined): NormalizedTransactionStatus {
  const v = (rawStatus || "").toUpperCase();
  if (v === "PENDING") return "PENDING";
  if (v === "SUCCEEDED") return "SUCCEEDED";
  if (v === "FAILED") return "FAILED";
  if (v === "CANCELED" || v === "CANCELLED" || v === "VOIDED") return "CANCELED";
  return "UNKNOWN";
}

/** Refunds only ever count toward Refund Status/Amount when SUCCEEDED —
 * failed/canceled refunds never happened from the organization's-money
 * point of view, and a PENDING-only set is surfaced as its own status
 * rather than silently treated as NONE. */
export function normalizeRefundStatus(
  paymentAmountCents: number,
  refunds: { amountCents: number | null; state: string | null }[]
): { status: NormalizedRefundStatus; refundedCents: number } {
  const succeededCents = refunds
    .filter((r) => (r.state || "").toUpperCase() === "SUCCEEDED")
    .reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const hasFailed = refunds.some((r) => (r.state || "").toUpperCase() === "FAILED");
  const hasPending = refunds.some((r) => ["PENDING", "UNKNOWN"].includes((r.state || "").toUpperCase()));

  if (succeededCents > 0 && succeededCents >= paymentAmountCents) return { status: "REFUNDED", refundedCents: succeededCents };
  if (succeededCents > 0) return { status: "PARTIALLY_REFUNDED", refundedCents: succeededCents };
  if (hasPending) return { status: "PENDING", refundedCents: 0 };
  if (hasFailed) return { status: "REFUND_FAILED", refundedCents: 0 };
  return { status: "NONE", refundedCents: 0 };
}

export function normalizeSettlementStatus(rawState: string | null | undefined): NormalizedSettlementStatus {
  const v = (rawState || "").toUpperCase();
  if (!v) return "NOT_SETTLED";
  if (v === "SETTLED" || v === "SUCCEEDED" || v === "PAID") return "SUCCEEDED";
  if (v === "PENDING" || v === "PROCESSING") return "PENDING";
  if (v === "FAILED") return "FAILED";
  return "UNKNOWN";
}

/**
 * Dispute "amount currently held" is a derived judgment call — the
 * processor only reports a coarse status, not a running ledger of held
 * funds. WON/CLOSED means the merchant kept the money (nothing held);
 * OPEN/NEEDS_RESPONSE/UNDER_REVIEW/LOST/ACCEPTED means the disputed
 * amount is either currently held or has been given to the donor, so it
 * counts against the organization's net either way. Documented here since
 * this exact mapping isn't specified anywhere else in the codebase.
 */
export function resolveDisputeAmountCents(dispute: (DisputeStatusInput & { amountCents: number | null }) | null): number {
  if (!dispute) return 0;
  const status = resolveDisputeDisplayStatus(dispute);
  if (status === "WON" || status === "CLOSED") return 0;
  return dispute.amountCents ?? 0;
}

// ─────────────────────────────────────────────────────────────────────────
// Canonical column list (exact order per spec section 2 + the metadata
// columns from section 22 + "Settlement Included?" from section 26)
// ─────────────────────────────────────────────────────────────────────────

export const TRANSACTION_EXPORT_COLUMNS: CsvColumn<TransactionExportRow>[] = [
  { header: "Report Type", value: (r) => r.reportType },
  { header: "Report Scope", value: (r) => r.reportScope },
  { header: "Report Owner Name", value: (r) => r.reportOwnerName },
  { header: "Report Owner Email", value: (r) => r.reportOwnerEmail },
  { header: "Report Owner User ID", value: (r) => r.reportOwnerUserId },
  { header: "Report Owner Role", value: (r) => r.reportOwnerRole },
  { header: "Generated By Name", value: (r) => r.generatedByName },
  { header: "Generated By Email", value: (r) => r.generatedByEmail },
  { header: "Generated At", value: (r) => formatIsoOrEmpty(r.generatedAt) },
  { header: "Reporting Period Start", value: (r) => formatIsoOrEmpty(r.periodStart) },
  { header: "Reporting Period End", value: (r) => formatIsoOrEmpty(r.periodEnd) },
  { header: "Applied Filters", value: (r) => r.appliedFilters },

  { header: "Organization Name", value: (r) => r.organizationName },
  { header: "Organization ID", value: (r) => r.organizationId },
  { header: "Team Member Name", value: (r) => r.teamMemberName },
  { header: "Team Member Email", value: (r) => r.teamMemberEmail },
  { header: "Giving Link Name", value: (r) => r.givingLinkName },
  { header: "Giving Link ID", value: (r) => r.givingLinkId },
  { header: "WGC Payment ID", value: (r) => r.wgcPaymentId },
  { header: "Processor Transaction ID", value: (r) => r.finixTransferId },
  { header: "Created At", value: (r) => formatIsoOrEmpty(r.createdAt) },
  { header: "Currency", value: (r) => r.currency },
  { header: "Donor Name", value: (r) => r.donorName },
  { header: "Donor Email", value: (r) => r.donorEmail },
  { header: "Donor Phone", value: (r) => r.donorPhone },
  { header: "Payment Method", value: (r) => r.paymentMethod },
  { header: "Instrument Type", value: (r) => r.instrumentType },
  { header: "Card Brand or Bank Type", value: (r) => r.cardBrandOrBankType },
  { header: "Last Four", value: (r) => r.lastFour },
  { header: "Transaction Status", value: (r) => r.transactionStatus },
  { header: "Refund Status", value: (r) => r.refundStatus },
  { header: "Dispute Status", value: (r) => r.disputeStatus },
  { header: "ACH Return Status", value: (r) => r.achReturnStatus },
  { header: "Donation Amount", value: (r) => formatMoneyOrEmpty(r.donationAmountCents) },
  { header: "Donor Processing Fee", value: (r) => formatMoneyOrEmpty(r.donorProcessingFeeCents) },
  { header: "Total Charged to Donor", value: (r) => formatMoneyOrEmpty(r.totalChargedToDonorCents) },
  { header: "Processor Fee", value: (r) => formatMoneyOrEmpty(r.finixProcessingFeeCents) },
  { header: "WGC Supplemental Fee", value: (r) => formatMoneyOrEmpty(r.wgcSupplementalFeeCents) },
  { header: "Other Processor Fees", value: (r) => formatMoneyOrEmpty(r.otherProcessorFeesCents) },
  { header: "Total Fees", value: (r) => formatMoneyOrEmpty(r.totalFeesCents) },
  { header: "Refund Amount", value: (r) => formatMoneyOrEmpty(r.refundAmountCents) },
  { header: "Dispute Amount", value: (r) => formatMoneyOrEmpty(r.disputeAmountCents) },
  { header: "ACH Return Amount", value: (r) => formatMoneyOrEmpty(r.achReturnAmountCents) },
  { header: "Expected Net to Organization", value: (r) => formatMoneyOrEmpty(r.expectedNetToOrganizationCents) },
  { header: "Actual Net to Organization", value: (r) => formatMoneyOrEmpty(r.actualNetToOrganizationCents) },
  { header: "Settlement Included?", value: (r) => r.settlementIncluded },
  { header: "Settlement Allocation Amount", value: (r) => formatMoneyOrEmpty(r.settlementAllocationAmountCents) },
  { header: "Settlement ID", value: (r) => r.settlementId },
  { header: "Settlement Status", value: (r) => r.settlementStatus },
  { header: "Settlement Created At", value: (r) => formatIsoOrEmpty(r.settlementCreatedAt) },
  { header: "Settlement Processed At", value: (r) => formatIsoOrEmpty(r.settlementProcessedAt) },
  { header: "Deposit or Funding Transfer ID", value: (r) => r.depositId },
  { header: "Deposit Status", value: (r) => r.depositStatus },
  { header: "Deposit Initiated At", value: (r) => formatIsoOrEmpty(r.depositInitiatedAt) },
  { header: "Deposit Completed At", value: (r) => formatIsoOrEmpty(r.depositCompletedAt) },
  { header: "Destination Bank Last Four", value: (r) => r.destinationBankLastFour },
  { header: "Trace ID", value: (r) => r.traceId },
  { header: "Reconciliation Status", value: (r) => r.reconciliationStatus },
  { header: "Data Notes", value: (r) => r.dataNotes },
];

export function renderTransactionCsv(rows: TransactionExportRow[]): string {
  return buildCsvExport(rows, TRANSACTION_EXPORT_COLUMNS);
}

export { csvResponse };

/** wgc-transactions-team-member-USER-YYYY-MM-DD.csv style names — sanitizes
 * any user-controlled segment (email, names) so it never becomes an unsafe
 * filename/path fragment. */
export function sanitizeFilenameSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unknown";
}

export function buildTransactionExportFilename(kind: "organization" | "team-member" | "giving-link" | "donor", identifier: string, ext: "csv" | "pdf"): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeId = sanitizeFilenameSegment(identifier);
  return `wgc-${kind}-transaction-settlement-report-${safeId}-${date}.${ext}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Row resolver — every payment-based export route calls this with its own
// already-scoped Payment `where` filter (the only thing that should differ
// between routes) and gets back fully-joined canonical rows.
// ─────────────────────────────────────────────────────────────────────────

export interface PaymentExportFilter {
  churchId: string;
  attributedUserId?: string;
  givingLinkId?: string;
  donorId?: string;
  createdAtRange?: { gte: Date; lte?: Date };
}

/**
 * churchId is always required and always comes from the authenticated
 * session (never a client-supplied value) — every caller of this function
 * must pass filter.churchId derived from requireMerchantSession(), never
 * from a request body/query param.
 */
export async function resolveTransactionExportRows(filter: PaymentExportFilter, metadata: ReportMetadata): Promise<TransactionExportRow[]> {
  const { churchId } = filter;

  const payments = await prisma.payment.findMany({
    where: {
      churchId,
      ...(filter.attributedUserId ? { attributedUserId: filter.attributedUserId } : {}),
      ...(filter.givingLinkId ? { givingLinkId: filter.givingLinkId } : {}),
      ...(filter.donorId ? { donorId: filter.donorId } : {}),
      ...(filter.createdAtRange ? { createdAt: filter.createdAtRange } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  if (payments.length === 0) return [];

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true, name: true } });

  const donorIds = [...new Set(payments.map((p) => p.donorId).filter((id): id is string => Boolean(id)))];
  const givingLinkIds = [...new Set(payments.map((p) => p.givingLinkId).filter((id): id is string => Boolean(id)))];
  const attributedUserIds = [...new Set(payments.map((p) => p.attributedUserId).filter((id): id is string => Boolean(id)))];
  const transferIds = [...new Set(payments.map((p) => p.finixTransferId).filter((id): id is string => Boolean(id)))];

  const [donors, givingLinks, users, transfers] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, email: true, phone: true } }) : Promise.resolve([]),
    givingLinkIds.length ? prisma.givingLink.findMany({ where: { id: { in: givingLinkIds } }, select: { id: true, internalName: true, publicTitle: true } }) : Promise.resolve([]),
    attributedUserIds.length ? prisma.user.findMany({ where: { id: { in: attributedUserIds } }, select: { id: true, email: true } }) : Promise.resolve([]),
    transferIds.length
      ? prisma.finixTransfer.findMany({
          where: { churchId, finixTransferId: { in: transferIds } },
          select: { finixTransferId: true, feeCents: true, finixSettlementId: true, finixPaymentInstrumentId: true },
        })
      : Promise.resolve([]),
  ]);

  const donorMap = new Map(donors.map((d) => [d.id, d]));
  const linkMap = new Map(givingLinks.map((l) => [l.id, l]));
  const userMap = new Map(users.map((u) => [u.id, u]));
  const transferMap = new Map(transfers.map((t) => [t.finixTransferId, t]));

  const instrumentIds = [...new Set(transfers.map((t) => t.finixPaymentInstrumentId).filter((id): id is string => Boolean(id)))];
  const settlementIds = [...new Set(transfers.map((t) => t.finixSettlementId).filter((id): id is string => Boolean(id)))];

  const [instruments, refunds, disputes, bankReturns, settlements] = await Promise.all([
    instrumentIds.length
      ? prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: { churchId, finixOriginalTransferId: { in: transferIds } },
          select: { finixOriginalTransferId: true, amountCents: true, state: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.finixDispute.findMany({
          where: { churchId, finixTransferId: { in: transferIds } },
          select: { finixTransferId: true, amountCents: true, processorState: true, evidenceDueAt: true, respondedAt: true, resolvedAt: true, outcome: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } }, select: { originalTransferId: true, amountCents: true, state: true } })
      : Promise.resolve([]),
    settlementIds.length
      ? prisma.finixSettlement.findMany({
          where: { finixSettlementId: { in: settlementIds } },
          select: { finixSettlementId: true, state: true, createdAtFinix: true, settledAt: true },
        })
      : Promise.resolve([]),
  ]);

  const instrumentMap = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));
  const settlementMap = new Map(settlements.map((s) => [s.finixSettlementId, s]));

  const deposits = settlementIds.length
    ? await prisma.finixFundingTransferAttempt.findMany({
        where: { finixSettlementId: { in: settlementIds } },
        select: {
          finixFundingTransferAttemptId: true,
          finixSettlementId: true,
          state: true,
          sentAt: true,
          arrivedAt: true,
          bankAccountLast4: true,
          traceId: true,
        },
      })
    : [];
  const depositBySettlement = new Map(deposits.map((d) => [d.finixSettlementId, d]));

  const refundsByTransfer = new Map<string, typeof refunds>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    const list = refundsByTransfer.get(r.finixOriginalTransferId) ?? [];
    list.push(r);
    refundsByTransfer.set(r.finixOriginalTransferId, list);
  }
  const disputeByTransfer = new Map<string, (typeof disputes)[number]>();
  for (const d of disputes) {
    if (d.finixTransferId) disputeByTransfer.set(d.finixTransferId, d);
  }
  const bankReturnsByTransfer = new Map<string, typeof bankReturns>();
  for (const br of bankReturns) {
    if (!br.originalTransferId) continue;
    const list = bankReturnsByTransfer.get(br.originalTransferId) ?? [];
    list.push(br);
    bankReturnsByTransfer.set(br.originalTransferId, list);
  }

  return payments.map((p) => {
    const transfer = p.finixTransferId ? transferMap.get(p.finixTransferId) : undefined;
    const instrument = transfer?.finixPaymentInstrumentId ? instrumentMap.get(transfer.finixPaymentInstrumentId) : undefined;
    const donor = p.donorId ? donorMap.get(p.donorId) : undefined;
    const givingLink = p.givingLinkId ? linkMap.get(p.givingLinkId) : undefined;
    const attributedUser = p.attributedUserId ? userMap.get(p.attributedUserId) : undefined;
    const settlement = transfer?.finixSettlementId ? settlementMap.get(transfer.finixSettlementId) : undefined;
    const deposit = transfer?.finixSettlementId ? depositBySettlement.get(transfer.finixSettlementId) : undefined;

    const transferRefunds = p.finixTransferId ? refundsByTransfer.get(p.finixTransferId) ?? [] : [];
    const { status: refundStatus, refundedCents } = normalizeRefundStatus(p.amountCents, transferRefunds);

    const dispute = p.finixTransferId ? disputeByTransfer.get(p.finixTransferId) : undefined;
    const disputeStatus = dispute ? resolveDisputeDisplayStatus(dispute) : "NONE";
    const disputeAmountCents = resolveDisputeAmountCents(dispute ?? null);

    const transferBankReturns = p.finixTransferId ? bankReturnsByTransfer.get(p.finixTransferId) ?? [] : [];
    const achReturnAmountCents = transferBankReturns.reduce((sum, br) => sum + (br.amountCents || 0), 0);
    const achReturnStatus: NormalizedAchReturnStatus = transferBankReturns.length > 0 ? "RETURNED" : "NONE";

    const donationAmountCents = p.donationAmountCents ?? p.amountCents;
    const donorProcessingFeeCents = p.donorCoversFee ? p.feeCoveredCents ?? 0 : 0;
    const totalChargedToDonorCents = donationAmountCents + donorProcessingFeeCents;

    // Finix's own reported fee — only ever the actual reconciled value
    // (FinixTransfer.feeCents), never the pre-transaction estimate
    // (Payment.fixedFeeCents/percentageBps). Empty (not 0.00) until Finix
    // reports it.
    const finixProcessingFeeCents = transfer?.feeCents ?? null;
    // No distinct "WGC platform fee" ledger exists separate from the
    // donor-covered-fee mechanic in the current schema — left empty
    // rather than fabricated. See final report.
    const wgcSupplementalFeeCents: number | null = null;
    // No other per-transaction processor fee category is tracked today —
    // a verified zero, not an unknown, so 0.00 is correct here.
    const otherProcessorFeesCents = 0;
    const totalFeesCents = finixProcessingFeeCents === null ? null : finixProcessingFeeCents + (wgcSupplementalFeeCents ?? 0) + otherProcessorFeesCents;

    const expectedNetToOrganizationCents = p.merchantExpectedNetCents ?? null;
    const actualNetToOrganizationCents =
      finixProcessingFeeCents === null
        ? null
        : p.amountCents - finixProcessingFeeCents - refundedCents - achReturnAmountCents - disputeAmountCents;

    const hasSettlement = Boolean(settlement);
    const settlementIncluded: SettlementIncluded = hasSettlement ? "YES" : "NO";
    const settlementAllocationAmountCents = hasSettlement ? p.amountCents : null;

    let reconciliationStatus: ReconciliationStatus;
    let dataNotes = "";
    if (!p.finixTransferId) {
      reconciliationStatus = "NOT_SETTLED";
      dataNotes = "No processor transaction linked to this payment yet";
    } else if (!settlement) {
      reconciliationStatus = "NOT_SETTLED";
      dataNotes = "Payment has not yet been included in a settlement";
    } else if (!deposit) {
      reconciliationStatus = "PENDING_SETTLEMENT";
      dataNotes = "Settlement created; deposit/funding transfer not yet available";
    } else if ((deposit.state || "").toUpperCase() === "FAILED") {
      reconciliationStatus = "DEPOSIT_FAILED";
    } else if (deposit.arrivedAt) {
      reconciliationStatus = actualNetToOrganizationCents === null ? "SETTLEMENT_MATCHED" : "RECONCILED";
    } else {
      reconciliationStatus = "DEPOSIT_PENDING";
    }
    if (!p.attributedUserId) {
      dataNotes = dataNotes ? `${dataNotes}; historical transaction has no attributed team member` : "Historical transaction has no attributed team member";
    }
    if (!p.givingLinkId) {
      dataNotes = dataNotes ? `${dataNotes}; historical transaction has no giving link` : "Historical transaction has no giving link";
    }
    if (finixProcessingFeeCents === null) {
      dataNotes = dataNotes ? `${dataNotes}; processor fee data pending confirmation` : "Processor fee data pending confirmation";
    }

    return {
      reportType: metadata.reportType,
      reportScope: metadata.reportScope,
      reportOwnerName: metadata.ownerName,
      reportOwnerEmail: metadata.ownerEmail,
      reportOwnerUserId: metadata.ownerUserId,
      reportOwnerRole: metadata.ownerRole,
      generatedByName: metadata.generatedByName,
      generatedByEmail: metadata.generatedByEmail,
      generatedAt: metadata.generatedAt,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      appliedFilters: metadata.appliedFilters,

      organizationName: church?.name || "",
      organizationId: churchId,
      teamMemberName: attributedUser?.email || "",
      teamMemberEmail: attributedUser?.email || "",
      givingLinkName: givingLink?.internalName || givingLink?.publicTitle || "",
      givingLinkId: givingLink?.id || "",
      wgcPaymentId: p.id,
      finixTransferId: p.finixTransferId || "",
      createdAt: p.createdAt,
      currency: p.currency || "USD",
      donorName: formatPersonName(donor?.name, instrument?.accountHolderName),
      donorEmail: donor?.email || "",
      donorPhone: donor?.phone || "",
      paymentMethod: normalizePaymentMethod(p.paymentMethodType),
      instrumentType: instrument?.instrumentType || instrument?.paymentMethodType || "",
      cardBrandOrBankType: instrument?.cardBrand || instrument?.bankAccountType || "",
      lastFour: instrument?.cardLast4 || instrument?.bankLast4 || "",
      transactionStatus: normalizeTransactionStatus(p.status),
      refundStatus,
      disputeStatus,
      achReturnStatus,
      donationAmountCents,
      donorProcessingFeeCents,
      totalChargedToDonorCents,
      finixProcessingFeeCents,
      wgcSupplementalFeeCents,
      otherProcessorFeesCents,
      totalFeesCents,
      refundAmountCents: refundedCents,
      disputeAmountCents,
      achReturnAmountCents,
      expectedNetToOrganizationCents,
      actualNetToOrganizationCents,
      settlementIncluded,
      settlementAllocationAmountCents,
      settlementId: settlement?.finixSettlementId || "",
      settlementStatus: normalizeSettlementStatus(settlement?.state),
      settlementCreatedAt: settlement?.createdAtFinix || null,
      settlementProcessedAt: settlement?.settledAt || null,
      depositId: deposit?.finixFundingTransferAttemptId || "",
      depositStatus: (deposit?.state || "").toUpperCase() || (hasSettlement ? "PENDING" : ""),
      depositInitiatedAt: deposit?.sentAt || null,
      depositCompletedAt: deposit?.arrivedAt || null,
      destinationBankLastFour: deposit?.bankAccountLast4 || "",
      traceId: deposit?.traceId || "",
      reconciliationStatus,
      dataNotes,
    };
  });
}

export interface TransactionReportSummary {
  transactionCount: number;
  grossDonationAmountCents: number;
  donorProcessingFeesCents: number;
  totalChargedToDonorsCents: number;
  finixProcessingFeesCents: number | null;
  wgcSupplementalFeesCents: number | null;
  otherProcessorFeesCents: number;
  totalFeesCents: number | null;
  refundAmountCents: number;
  disputeAmountCents: number;
  achReturnAmountCents: number;
  expectedNetToOrganizationCents: number | null;
  actualNetToOrganizationCents: number | null;
  settlementAllocationTotalCents: number;
  unsettledAmountCents: number;
  unmatchedAmountCents: number;
}

/** Aggregates the same rows the CSV/PDF both render from — so summary
 * totals can never drift from the detail rows (same underlying data). */
export function summarizeTransactionReport(rows: TransactionExportRow[]): TransactionReportSummary {
  const sum = (f: (r: TransactionExportRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const sumOrNullIfAnyUnknown = (f: (r: TransactionExportRow) => number | null) => {
    if (rows.some((r) => f(r) === null)) return null;
    return rows.reduce((s, r) => s + (f(r) ?? 0), 0);
  };

  return {
    transactionCount: rows.length,
    grossDonationAmountCents: sum((r) => r.donationAmountCents),
    donorProcessingFeesCents: sum((r) => r.donorProcessingFeeCents),
    totalChargedToDonorsCents: sum((r) => r.totalChargedToDonorCents),
    finixProcessingFeesCents: sumOrNullIfAnyUnknown((r) => r.finixProcessingFeeCents),
    wgcSupplementalFeesCents: sumOrNullIfAnyUnknown((r) => r.wgcSupplementalFeeCents),
    otherProcessorFeesCents: sum((r) => r.otherProcessorFeesCents),
    totalFeesCents: sumOrNullIfAnyUnknown((r) => r.totalFeesCents),
    refundAmountCents: sum((r) => r.refundAmountCents),
    disputeAmountCents: sum((r) => r.disputeAmountCents),
    achReturnAmountCents: sum((r) => r.achReturnAmountCents),
    expectedNetToOrganizationCents: sumOrNullIfAnyUnknown((r) => r.expectedNetToOrganizationCents),
    actualNetToOrganizationCents: sumOrNullIfAnyUnknown((r) => r.actualNetToOrganizationCents),
    settlementAllocationTotalCents: sum((r) => r.settlementAllocationAmountCents ?? 0),
    unsettledAmountCents: sum((r) => (r.settlementIncluded === "NO" ? r.donationAmountCents : 0)),
    unmatchedAmountCents: sum((r) => (r.settlementIncluded === "UNMATCHED" ? r.donationAmountCents : 0)),
  };
}
