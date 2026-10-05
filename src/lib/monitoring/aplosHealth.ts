import { recordHealthEvent } from "./healthEvents";
import type { AplosErrorCategory } from "@/lib/integrations/aplos/errors";

/**
 * Records a WGC health event for an Aplos sync outcome — called from
 * src/lib/integrations/aplos/syncEngine.ts's finalizeFailed() and
 * finalizeNeedsReview() only (the two TERMINAL bad outcomes: retries
 * exhausted, or an ambiguous result frozen for manual review). Deliberately
 * NOT called from finalizeRetryScheduled() — a scheduled automatic retry is
 * an expected, self-healing intermediate state, not yet a "meaningful
 * transition" worth recording, same reasoning as "don't create an incident
 * for one transient webhook retry."
 *
 * Reuses AplosSyncRecord/AplosSyncAttempt as the source of truth for sync
 * history and retry state (per "do not duplicate Aplos sync records") —
 * this only adds System Health visibility (Errors page, WGC-XXXXXX
 * reference, cross-service aggregation) on top of data that already exists.
 * serviceStatus.ts's aplosStatus() independently computes the Aplos service
 * card status directly from AplosSyncRecord, not from this — these events
 * are for drill-down/history, not the primary signal.
 *
 * Severity reflects whether the category represents WGC/Aplos technical
 * trouble vs. a per-merchant setup/data gap (mapping not configured,
 * validation rejection) — the latter still gets recorded (useful for WGC
 * support to see a merchant is stuck), but at WARNING so it never
 * contributes to "Aplos service is Degraded" in the same way a real outage
 * would.
 */
function severityForAplosCategory(category: AplosErrorCategory): "WARNING" | "ERROR" {
  switch (category) {
    case "AUTHENTICATION_REQUIRED":
    case "ACCESS_DENIED":
    case "TEMPORARY_APLOS_ERROR":
    case "AMBIGUOUS_RESULT":
    case "UNKNOWN_ERROR":
      return "ERROR";
    case "MAPPING_REQUIRED":
    case "INVALID_CONFIGURATION":
    case "RECONCILIATION_ERROR":
    case "VALIDATION_ERROR":
    case "RATE_LIMITED":
      return "WARNING";
  }
}

export function recordAplosSyncOutcome(params: {
  outcome: "FAILED" | "NEEDS_REVIEW";
  churchId: string;
  syncRecordId: string;
  finixSettlementId: string;
  category: AplosErrorCategory;
  safeMessage: string;
}): void {
  void recordHealthEvent({
    service: "Aplos",
    integration: "aplos",
    operation: "settlement_sync",
    status: "FAILED",
    severity: params.outcome === "NEEDS_REVIEW" ? "ERROR" : severityForAplosCategory(params.category),
    merchantId: params.churchId,
    externalId: params.syncRecordId,
    errorCode: params.category,
    message: params.safeMessage,
    metadata: { outcome: params.outcome, finixSettlementId: params.finixSettlementId, category: params.category },
  }).catch((err) => {
    console.error("[recordAplosSyncOutcome] failed to record health event:", err);
  });
}
