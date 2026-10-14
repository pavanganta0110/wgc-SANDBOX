/**
 * Client-safe vocabulary for gift sync: the labels and explanations the UI
 * shows, and the shape of the overview. No server imports here.
 */

export type SkipReason =
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "RETURNED"
  | "NOT_SUCCEEDED"
  | "DONOR_COVERED_FEE"
  | "GOODS_OR_SERVICES"
  | "UNSUPPORTED_PAYMENT_METHOD"
  | "MANUAL";

/** Plain-language, church-facing explanation for every skip. Never a raw error. */
export const SKIP_MESSAGES: Record<SkipReason, string> = {
  REFUNDED: "Refunded in WGC before it was sent, so there is nothing to record.",
  PARTIALLY_REFUNDED: "Partially refunded in WGC before it was sent. Enter it in Planning Center manually for the amount you kept.",
  RETURNED: "The bank returned this payment, so there is nothing to record.",
  NOT_SUCCEEDED: "This payment did not complete successfully, so it was not recorded.",
  DONOR_COVERED_FEE: "The donor covered the processing fee. WGC has not yet decided how that should be recorded as a donation amount, so it was not sent.",
  GOODS_OR_SERVICES: "Includes goods or services (for example an event ticket), so only part of it is a donation. Enter it in Planning Center manually.",
  UNSUPPORTED_PAYMENT_METHOD: "Paid with a method that isn't supported for Planning Center yet.",
  MANUAL: "You chose not to send this gift.",
};

export const HELD_MESSAGES: Record<string, string> = {
  PERSON_NOT_FOUND: "No matching person was found in Planning Center for this donor.",
  PERSON_NEEDS_REVIEW: "Several people in Planning Center could match this donor. Choose the right one.",
  NO_NAME: "This donor has no usable name, so a Planning Center person can't be created.",
  PERSON_CREATE_UNCERTAIN: "Creating this donor in Planning Center didn't confirm. WGC will look for them before trying again.",
};

export const SYNC_STATUS_LABELS: Record<string, { label: string; tone: "ok" | "info" | "warn" | "bad" | "muted" }> = {
  PENDING: { label: "Waiting", tone: "muted" },
  PROCESSING: { label: "Sending…", tone: "info" },
  IN_PROGRESS: { label: "Sending", tone: "info" },
  BLOCKED: { label: "Paused", tone: "warn" },
  BLOCKED_AWAITING_FEES: { label: "Waiting for fee details", tone: "muted" },
  DRY_RUN: { label: "Previewed", tone: "info" },
  SYNCED: { label: "Sent", tone: "ok" },
  PARTIAL: { label: "Sent, some held", tone: "warn" },
  RETRY_SCHEDULED: { label: "Will retry", tone: "warn" },
  FAILED: { label: "Failed", tone: "bad" },
  NEEDS_REVIEW: { label: "Needs your review", tone: "bad" },
  CANCELLED: { label: "Cancelled", tone: "muted" },
};

export type SyncMode = "OFF" | "DRY_RUN" | "LIVE";
export type UnmatchedDonorPolicy = "HOLD_FOR_REVIEW" | "CREATE_PERSON" | "ANONYMOUS";

export interface SyncSettingsInput {
  syncMode?: SyncMode;
  unmatchedDonorPolicy?: UnmatchedDonorPolicy;
  autoCommitBatches?: boolean;
}

export interface SyncRecordRow {
  id: string;
  settlementId: string;
  status: string;
  blockedReason: string | null;
  lastErrorMessage: string | null;
  pcoBatchId: string | null;
  commitStatus: string;
  updatedAt: string;
  counts: { created: number; skipped: number; held: number; needsReview: number; failed: number; pending: number };
}

export interface ReviewItem {
  donationId: string;
  syncRecordId: string;
  settlementId: string;
  status: "NEEDS_REVIEW" | "FAILED";
  amountCents: number;
  receivedOn: string;
  message: string;
}

export interface HeldItem {
  donationId: string;
  donorId: string | null;
  donorName: string | null;
  amountCents: number;
  receivedOn: string;
  reason: string;
  message: string;
}

export interface AttentionItem {
  paymentId: string;
  amountCents: number;
  receivedOn: string;
  paymentStatus: string;
  pcoDonationId: string | null;
  pcoBatchId: string | null;
  message: string;
}

export interface SkippedItem {
  paymentId: string;
  amountCents: number;
  receivedOn: string;
  reason: string;
  message: string;
}

export interface SyncOverview {
  platformEnabled: boolean;
  settings: { syncMode: SyncMode; unmatchedDonorPolicy: UnmatchedDonorPolicy; autoCommitBatches: boolean; enabledAt: string | null };
  ready: boolean;
  readinessReasons: string[];
  hasDryRun: boolean;
  records: SyncRecordRow[];
  needsReview: ReviewItem[];
  held: { total: number; items: HeldItem[] };
  /** Gifts already recorded in Planning Center whose WGC payment was refunded, returned or failed afterwards. */
  needsAttention: AttentionItem[];
  skipped: { total: number; items: SkippedItem[] };
}

export function describePaymentChange(status: string): string {
  const what = status === "REFUNDED" ? "refunded" : status === "PARTIALLY_REFUNDED" ? "partially refunded" : status === "RETURNED" ? "returned by the bank" : "marked as failed";
  return `This gift is in Planning Center, but the payment was later ${what} in WGC. Update it in Planning Center so your records match.`;
}
