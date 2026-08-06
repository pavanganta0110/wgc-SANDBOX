import { formatCents } from "@/lib/format";
import type {
  TransferAggregate,
  DisputeAggregate,
  RefundAggregate,
  AuthorizationAggregate,
  DepositAggregate,
} from "./dashboardAggregates";

interface SummaryInputs {
  transfers: TransferAggregate;
  disputes: DisputeAggregate;
  refunds: RefundAggregate;
  authorizations: AuthorizationAggregate;
  deposits: DepositAggregate;
}

export const DEFAULT_METRICS = [
  "totalTransactionVolume",
  "avgTransactionAmount",
  "totalDisputeVolume",
  "totalRefundVolume",
];

export const METRIC_LABELS: Record<string, string> = {
  totalTransactionVolume: "Total Transaction Volume",
  avgTransactionAmount: "Avg. Transaction Amount",
  totalDisputeVolume: "Total Dispute Volume",
  totalRefundVolume: "Total Refund Volume",
  totalTransactionCount: "Total Transaction Count",
  totalDisputeCount: "Total Dispute Count",
  activeDisputeCount: "Active Dispute Count",
  disputeRate: "Dispute Rate",
  successfulRefundCount: "Successful Refund Count",
  successfulRefundVolume: "Successful Refund Volume",
  failedRefundCount: "Failed Refund Count",
  failedRefundVolume: "Failed Refund Volume",
  authorizationRate: "Authorization Rate",
  authorizationRequestCount: "Authorization Request Count",
  authorizationRequestVolume: "Authorization Request Volume",
  voidedAuthorizationCount: "Voided Authorization Count",
  voidedAuthorizationVolume: "Voided Authorization Volume",
  totalDeposits: "Total Deposits",
};

/**
 * Pure formatting/derivation over already-aggregated numbers — see
 * src/lib/reports/dashboardAggregates.ts for where those sums/counts
 * actually come from (database-side aggregate queries, not row-by-row
 * reduction in JS).
 */
export function computeSummaryMetrics(inputs: SummaryInputs): Record<string, string> {
  const avgTransactionCents =
    inputs.transfers.succeededCount > 0
      ? inputs.transfers.succeededVolumeCents / inputs.transfers.succeededCount
      : 0;

  const disputeRate =
    inputs.transfers.totalCount > 0
      ? (inputs.disputes.totalCount / inputs.transfers.totalCount) * 100
      : 0;

  const authorizationRate =
    inputs.authorizations.totalCount > 0
      ? (inputs.authorizations.succeededCount / inputs.authorizations.totalCount) * 100
      : 0;

  return {
    totalTransactionVolume: formatCents(inputs.transfers.succeededVolumeCents),
    avgTransactionAmount: formatCents(avgTransactionCents),
    totalDisputeVolume: formatCents(inputs.disputes.totalVolumeCents),
    totalRefundVolume: formatCents(inputs.refunds.totalVolumeCents),
    totalTransactionCount: String(inputs.transfers.totalCount),
    totalDisputeCount: String(inputs.disputes.totalCount),
    activeDisputeCount: String(inputs.disputes.activeCount),
    disputeRate: `${disputeRate.toFixed(1)}%`,
    successfulRefundCount: String(inputs.refunds.succeededCount),
    successfulRefundVolume: formatCents(inputs.refunds.succeededVolumeCents),
    failedRefundCount: String(inputs.refunds.failedCount),
    failedRefundVolume: formatCents(inputs.refunds.failedVolumeCents),
    authorizationRate: `${authorizationRate.toFixed(1)}%`,
    authorizationRequestCount: String(inputs.authorizations.totalCount),
    authorizationRequestVolume: formatCents(inputs.authorizations.requestedVolumeCents),
    voidedAuthorizationCount: String(inputs.authorizations.voidedCount),
    voidedAuthorizationVolume: formatCents(inputs.authorizations.voidedVolumeCents),
    totalDeposits: formatCents(inputs.deposits.totalVolumeCents),
  };
}
