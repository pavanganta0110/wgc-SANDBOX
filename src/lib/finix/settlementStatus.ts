/**
 * WGC-facing settlement status, computed on read from processorState (the
 * raw, never-overwritten value from the processor). A settlement's own
 * lifecycle is already fully described by the processor's own status
 * field, so this is a normalization layer (uppercase + a label lookup),
 * not a real derivation.
 *
 * Historically this coerced any status not in a hardcoded allowlist to
 * "UNKNOWN" — which silently mislabeled real, valid Finix statuses (e.g.
 * "APPROVED") that just hadn't been added to the list yet. Per the fix:
 * this now always trusts and returns whatever Finix actually reported,
 * uppercased. "UNKNOWN" is reserved strictly for when there is truly no
 * processor status at all (null/missing) — never used to paper over an
 * incomplete allowlist.
 */
export type SettlementDisplayStatus = string;

export const SETTLEMENT_UNKNOWN_STATUS = "UNKNOWN";

// Every status this app has actually seen or been told to expect from
// Finix — used only to supply a friendlier label; presence/absence here
// never affects whether a status is trusted (see normalizeSettlementStatus).
const SETTLEMENT_STATUS_LABELS: Record<string, string> = {
  ACCRUING: "Accruing",
  AWAITING_APPROVAL: "Awaiting Approval",
  APPROVED: "Approved",
  PENDING: "Pending",
  PROCESSING: "Processing",
  READY: "Ready",
  FUNDED: "Funded",
  SETTLED: "Settled",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELED: "Canceled",
  CANCELLED: "Canceled",
  UNKNOWN: "Unknown",
};

export interface SettlementStatusInput {
  processorState?: string | null;
}

/**
 * Centralized settlement-status normalization — the single place this
 * mapping happens, so it's never duplicated/re-derived elsewhere. Returns
 * the real uppercased processor status whenever one exists; only falls
 * back to UNKNOWN when the value is missing entirely.
 */
export function normalizeSettlementStatus(value?: string | null): string {
  if (!value) return SETTLEMENT_UNKNOWN_STATUS;
  return value.toUpperCase();
}

export function resolveSettlementDisplayStatus(settlement: SettlementStatusInput): string {
  return normalizeSettlementStatus(settlement.processorState);
}

/** Finite list for the status filter dropdown only — display/normalization never depends on this list, so a real Finix status the merchant sees but that isn't listed here just won't be filterable by name yet, not mislabeled. */
export const SETTLEMENT_FILTER_STATUSES = Object.keys(SETTLEMENT_STATUS_LABELS).filter((s) => s !== SETTLEMENT_UNKNOWN_STATUS);

export function getSettlementStatusLabel(status: string): string {
  if (SETTLEMENT_STATUS_LABELS[status]) return SETTLEMENT_STATUS_LABELS[status];
  if (!status) return "Unknown";
  return status.charAt(0) + status.slice(1).toLowerCase().replace(/_/g, " ");
}
