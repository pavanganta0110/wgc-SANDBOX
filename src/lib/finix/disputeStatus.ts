/**
 * WGC-only UI status for a dispute, computed on read from processorState
 * (the raw, never-overwritten value from the processor) plus our own
 * evidence-workflow timestamps — never stored, so it can't go stale the
 * way the old `state` column did (overwritten on every sync with no
 * memory of what it used to represent).
 *
 * The processor's own dispute resource only reports a coarse PENDING/WON/
 * LOST/EXPIRED state (confirmed against every dispute synced so far) —
 * it doesn't distinguish "needs your response" from "you responded, now
 * under review" at the API level. That finer-grained status is entirely
 * derived here from evidenceDueAt/respondedAt/resolvedAt/outcome.
 */
export type DisputeDisplayStatus =
  | "OPEN"
  | "NEEDS_RESPONSE"
  | "UNDER_REVIEW"
  | "WON"
  | "LOST"
  | "EXPIRED"
  | "ACCEPTED"
  | "CLOSED"
  | "UNKNOWN";

export interface DisputeStatusInput {
  processorState: string | null;
  evidenceDueAt: Date | null;
  respondedAt: Date | null;
  resolvedAt: Date | null;
  outcome: string | null;
}

export function resolveDisputeDisplayStatus(dispute: DisputeStatusInput): DisputeDisplayStatus {
  const processorState = (dispute.processorState || "").toUpperCase();

  if (processorState === "WON") return "WON";
  if (processorState === "LOST") return "LOST";

  if (dispute.resolvedAt) {
    const outcome = (dispute.outcome || "").toUpperCase();
    if (outcome === "WON") return "WON";
    if (outcome === "LOST") return "LOST";
    if (outcome === "ACCEPTED") return "ACCEPTED";
    return "CLOSED";
  }

  if (processorState === "EXPIRED") return "EXPIRED";
  // Safety net: the processor's own EXPIRED transition can lag behind the
  // deadline by a sync cycle — treat a passed deadline with no response as
  // expired locally too, so the badge/tab never trails reality.
  if (dispute.evidenceDueAt && !dispute.respondedAt && dispute.evidenceDueAt.getTime() < Date.now()) {
    return "EXPIRED";
  }

  if (dispute.respondedAt) return "UNDER_REVIEW";
  if (dispute.evidenceDueAt) return "NEEDS_RESPONSE";
  if (processorState === "PENDING" || processorState) return "OPEN";
  return "UNKNOWN";
}

export const DISPUTE_DISPLAY_STATUS_LABELS: Record<DisputeDisplayStatus, string> = {
  OPEN: "Open",
  NEEDS_RESPONSE: "Needs Response",
  UNDER_REVIEW: "Under Review",
  WON: "Won",
  LOST: "Lost",
  EXPIRED: "Expired",
  ACCEPTED: "Accepted",
  CLOSED: "Closed",
  UNKNOWN: "Unknown",
};

export interface DisputeNeedsAttentionInput extends DisputeStatusInput {
  submissionError: string | null;
}

export interface NeedsAttentionResult {
  needsAttention: boolean;
  reasons: string[];
}

/**
 * A dispute needs merchant action when it's not in a terminal state and
 * either has no submitted response yet, its deadline is close/passed, or
 * a previous submission attempt failed.
 */
export function resolveDisputeNeedsAttention(dispute: DisputeNeedsAttentionInput): NeedsAttentionResult {
  const status = resolveDisputeDisplayStatus(dispute);
  const reasons: string[] = [];

  if (status === "WON" || status === "LOST" || status === "ACCEPTED" || status === "CLOSED") {
    return { needsAttention: false, reasons };
  }

  if (status === "EXPIRED") {
    reasons.push("Evidence deadline has passed");
  } else if (!dispute.respondedAt) {
    reasons.push("Awaiting your response");
    if (dispute.evidenceDueAt) {
      const hoursRemaining = (dispute.evidenceDueAt.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursRemaining <= 72 && hoursRemaining > 0) {
        reasons.push("Evidence due within 72 hours");
      }
    }
  }

  if (dispute.submissionError) {
    reasons.push("Previous submission failed");
  }

  return { needsAttention: reasons.length > 0, reasons };
}
