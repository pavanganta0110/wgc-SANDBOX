import type { DisputeDetail } from "@/lib/finix/disputeDetail";
import type { TimelineEvent } from "@/components/merchant/detail/TransactionTimeline";
import { resolveDisputeDisplayStatus } from "@/lib/finix/disputeStatus";

/**
 * Builds the full dispute lifecycle timeline from real, already-recorded
 * data only — every step here corresponds to an actual timestamp already
 * stored somewhere (transfer/settlement/dispute/evidence/reversal). No step
 * is shown unless its underlying event actually happened.
 */
export function buildDisputeTimeline(detail: DisputeDetail): TimelineEvent[] {
  const { dispute, transfer, settlement, activeEvidence, disputeReversal } = detail;
  const events: TimelineEvent[] = [];

  if (transfer?.createdAtFinix) {
    events.push({ label: "Payment Created", date: transfer.createdAtFinix });
  }
  if (settlement?.settledAt) {
    events.push({ label: "Payment Settled", date: settlement.settledAt });
  }
  if (dispute.createdAtFinix) {
    events.push({
      label: "Dispute Opened",
      sublabel: dispute.reason || undefined,
      date: dispute.createdAtFinix,
    });
  }
  if (dispute.evidenceDueAt) {
    events.push({ label: "Evidence Requested", date: dispute.evidenceDueAt });
  }
  for (const e of [...activeEvidence].reverse()) {
    events.push({
      label: "Evidence Uploaded",
      sublabel: e.fileName,
      date: e.createdAt,
      actor: e.uploadedByEmail || undefined,
    });
  }
  if (dispute.respondedAt) {
    events.push({ label: "Evidence Submitted", date: dispute.respondedAt });
    events.push({ label: "Processor Reviewing", date: dispute.respondedAt });
  }
  if (dispute.resolvedAt) {
    const status = resolveDisputeDisplayStatus(dispute);
    events.push({
      label: "Decision",
      sublabel: status === "WON" ? "Won" : status === "LOST" ? "Lost" : dispute.outcome || undefined,
      date: dispute.resolvedAt,
    });
  }
  if (disputeReversal?.createdAtFinix) {
    events.push({ label: "Funds Returned", date: disputeReversal.createdAtFinix });
  }

  return events
    .filter((e) => e.date !== null)
    .sort((a, b) => new Date(a.date as Date).getTime() - new Date(b.date as Date).getTime());
}
