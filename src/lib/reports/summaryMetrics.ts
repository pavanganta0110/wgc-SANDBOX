import { formatCents } from "@/lib/format";
import type {
  TransferAggregate,
  DisputeAggregate,
  RefundAggregate,
  AuthorizationAggregate,
  DepositAggregate,
} from "./dashboardAggregates";

export interface SummaryInputs {
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

export type MetricKind = "cents" | "count" | "percent";

/**
 * Whether a rise in the metric is good news. Drives the delta pill colour by
 * meaning, not direction: more disputes is bad, more volume is good.
 * "neutral" metrics (request counts, etc.) never get a good/bad colour.
 */
export type MetricPolarity = "good" | "bad" | "neutral";

export const METRIC_META: Record<string, { kind: MetricKind; polarity: MetricPolarity }> = {
  totalTransactionVolume: { kind: "cents", polarity: "good" },
  avgTransactionAmount: { kind: "cents", polarity: "good" },
  totalDisputeVolume: { kind: "cents", polarity: "bad" },
  totalRefundVolume: { kind: "cents", polarity: "bad" },
  totalTransactionCount: { kind: "count", polarity: "good" },
  totalDisputeCount: { kind: "count", polarity: "bad" },
  activeDisputeCount: { kind: "count", polarity: "bad" },
  disputeRate: { kind: "percent", polarity: "bad" },
  successfulRefundCount: { kind: "count", polarity: "neutral" },
  successfulRefundVolume: { kind: "cents", polarity: "neutral" },
  failedRefundCount: { kind: "count", polarity: "bad" },
  failedRefundVolume: { kind: "cents", polarity: "bad" },
  authorizationRate: { kind: "percent", polarity: "good" },
  authorizationRequestCount: { kind: "count", polarity: "neutral" },
  authorizationRequestVolume: { kind: "cents", polarity: "neutral" },
  voidedAuthorizationCount: { kind: "count", polarity: "bad" },
  voidedAuthorizationVolume: { kind: "cents", polarity: "bad" },
  totalDeposits: { kind: "cents", polarity: "good" },
};

/**
 * Every summary figure as a plain number (cents / count / percent 0-100), so
 * the dashboard can compare two periods. computeSummaryMetrics below is just
 * these numbers formatted — one set of formulas, never two.
 */
export function computeSummaryNumbers(inputs: SummaryInputs): Record<string, number> {
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
    totalTransactionVolume: inputs.transfers.succeededVolumeCents,
    avgTransactionAmount: avgTransactionCents,
    totalDisputeVolume: inputs.disputes.totalVolumeCents,
    totalRefundVolume: inputs.refunds.totalVolumeCents,
    totalTransactionCount: inputs.transfers.totalCount,
    totalDisputeCount: inputs.disputes.totalCount,
    activeDisputeCount: inputs.disputes.activeCount,
    disputeRate,
    successfulRefundCount: inputs.refunds.succeededCount,
    successfulRefundVolume: inputs.refunds.succeededVolumeCents,
    failedRefundCount: inputs.refunds.failedCount,
    failedRefundVolume: inputs.refunds.failedVolumeCents,
    authorizationRate,
    authorizationRequestCount: inputs.authorizations.totalCount,
    authorizationRequestVolume: inputs.authorizations.requestedVolumeCents,
    voidedAuthorizationCount: inputs.authorizations.voidedCount,
    voidedAuthorizationVolume: inputs.authorizations.voidedVolumeCents,
    totalDeposits: inputs.deposits.totalVolumeCents,
  };
}

export function formatMetricValue(kind: MetricKind, value: number): string {
  if (kind === "cents") return formatCents(value);
  if (kind === "percent") return `${value.toFixed(1)}%`;
  return String(value);
}

export type DeltaDirection = "up" | "down" | "flat" | "none";

export interface MetricDelta {
  direction: DeltaDirection;
  /** Pill text, always carries a sign or word so colour is never the only cue. */
  label: string;
  /** good / bad by meaning; neutral when polarity is neutral or nothing changed. */
  tone: "good" | "bad" | "neutral";
}

/**
 * Period-over-period change for one metric. Percent metrics (rates) report
 * the change in percentage points; others the relative % change. With no
 * comparable previous period (null) the result is direction "none" — the UI
 * shows no pill at all rather than a made-up number.
 */
export function computeMetricDelta(
  kind: MetricKind,
  polarity: MetricPolarity,
  current: number,
  previous: number | null
): MetricDelta {
  if (previous == null) return { direction: "none", label: "", tone: "neutral" };
  // Nothing then and nothing now: no pill, rather than a meaningless "0%".
  if (current === 0 && previous === 0) return { direction: "none", label: "", tone: "neutral" };

  if (kind === "percent") {
    const diff = current - previous;
    if (Math.abs(diff) < 0.05) return { direction: "flat", label: "0.0 pts", tone: "neutral" };
    const direction: DeltaDirection = diff > 0 ? "up" : "down";
    return { direction, label: `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`, tone: toneFor(direction, polarity) };
  }

  if (previous === 0) {
    return { direction: "up", label: "New", tone: toneFor("up", polarity) };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { direction: "flat", label: "0%", tone: "neutral" };
  const direction: DeltaDirection = pct > 0 ? "up" : "down";
  return { direction, label: `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(1)}%`, tone: toneFor(direction, polarity) };
}

function toneFor(direction: DeltaDirection, polarity: MetricPolarity): MetricDelta["tone"] {
  if (polarity === "neutral" || (direction !== "up" && direction !== "down")) return "neutral";
  const rising = direction === "up";
  return (rising && polarity === "good") || (!rising && polarity === "bad") ? "good" : "bad";
}

/**
 * Pure formatting/derivation over already-aggregated numbers — see
 * src/lib/reports/dashboardAggregates.ts for where those sums/counts
 * actually come from (database-side aggregate queries, not row-by-row
 * reduction in JS).
 */
export function computeSummaryMetrics(inputs: SummaryInputs): Record<string, string> {
  const numbers = computeSummaryNumbers(inputs);
  const out: Record<string, string> = {};
  for (const key of Object.keys(numbers)) {
    out[key] = formatMetricValue(METRIC_META[key].kind, numbers[key]);
  }
  return out;
}
