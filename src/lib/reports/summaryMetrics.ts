import { formatCents } from "@/lib/format";

interface MetricInputs {
  transfers: { state: string | null; amountCents: number | null }[];
  disputes: { state: string | null; amountCents: number | null }[];
  refunds: { state: string | null; amountCents: number | null }[];
  authorizations: {
    state: string | null;
    amountCents: number | null;
    amountRequestedCents: number | null;
    isVoid: boolean | null;
  }[];
  deposits: { amountCents: number | null }[];
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

export function computeSummaryMetrics(inputs: MetricInputs): Record<string, string> {
  const succeededTransfers = inputs.transfers.filter(
    (t) => (t.state || "").toUpperCase() === "SUCCEEDED"
  );
  const totalVolumeCents = succeededTransfers.reduce((sum, t) => sum + (t.amountCents ?? 0), 0);
  const avgTransactionCents =
    succeededTransfers.length > 0 ? totalVolumeCents / succeededTransfers.length : 0;

  const totalDisputeVolumeCents = inputs.disputes.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);
  const activeDisputeCount = inputs.disputes.filter(
    (d) => (d.state || "").toLowerCase() === "pending"
  ).length;
  const disputeRate =
    inputs.transfers.length > 0 ? (inputs.disputes.length / inputs.transfers.length) * 100 : 0;

  const successfulRefunds = inputs.refunds.filter(
    (r) => (r.state || "").toUpperCase() === "SUCCEEDED"
  );
  const failedRefunds = inputs.refunds.filter((r) => (r.state || "").toUpperCase() === "FAILED");
  const totalRefundVolumeCents = inputs.refunds.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);
  const successfulRefundVolumeCents = successfulRefunds.reduce(
    (sum, r) => sum + (r.amountCents ?? 0),
    0
  );
  const failedRefundVolumeCents = failedRefunds.reduce((sum, r) => sum + (r.amountCents ?? 0), 0);

  const approvedAuths = inputs.authorizations.filter(
    (a) => (a.state || "").toUpperCase() === "SUCCEEDED"
  );
  const voidedAuths = inputs.authorizations.filter((a) => Boolean(a.isVoid));
  const authorizationRate =
    inputs.authorizations.length > 0
      ? (approvedAuths.length / inputs.authorizations.length) * 100
      : 0;
  const authorizationRequestVolumeCents = inputs.authorizations.reduce(
    (sum, a) => sum + (a.amountRequestedCents ?? 0),
    0
  );
  const voidedAuthorizationVolumeCents = voidedAuths.reduce(
    (sum, a) => sum + (a.amountCents ?? 0),
    0
  );

  const totalDepositsCents = inputs.deposits.reduce((sum, d) => sum + (d.amountCents ?? 0), 0);

  return {
    totalTransactionVolume: formatCents(totalVolumeCents),
    avgTransactionAmount: formatCents(avgTransactionCents),
    totalDisputeVolume: formatCents(totalDisputeVolumeCents),
    totalRefundVolume: formatCents(totalRefundVolumeCents),
    totalTransactionCount: String(inputs.transfers.length),
    totalDisputeCount: String(inputs.disputes.length),
    activeDisputeCount: String(activeDisputeCount),
    disputeRate: `${disputeRate.toFixed(1)}%`,
    successfulRefundCount: String(successfulRefunds.length),
    successfulRefundVolume: formatCents(successfulRefundVolumeCents),
    failedRefundCount: String(failedRefunds.length),
    failedRefundVolume: formatCents(failedRefundVolumeCents),
    authorizationRate: `${authorizationRate.toFixed(1)}%`,
    authorizationRequestCount: String(inputs.authorizations.length),
    authorizationRequestVolume: formatCents(authorizationRequestVolumeCents),
    voidedAuthorizationCount: String(voidedAuths.length),
    voidedAuthorizationVolume: formatCents(voidedAuthorizationVolumeCents),
    totalDeposits: formatCents(totalDepositsCents),
  };
}
