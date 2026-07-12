export type BankAccountDisplayStatus =
  | "ACTIVE"
  | "PENDING"
  | "VERIFYING"
  | "VERIFIED"
  | "REQUIRES_ACTION"
  | "DISABLED"
  | "REJECTED"
  | "REPLACED"
  | "UNKNOWN";

/**
 * WGC-facing display status, kept separate from whatever raw processor
 * state a bank instrument reports — mirrors the pattern used throughout
 * this codebase (resolveSubscriptionDisplayStatus, resolveDonorDisplayStatus,
 * etc.) of never trusting a raw processor string directly in the UI.
 */
export function resolveBankAccountDisplayStatus(row: {
  status?: string | null;
  isActiveDestination: boolean;
  processorState?: string | null;
}): BankAccountDisplayStatus {
  const explicit = (row.status || "").toUpperCase();
  if (
    explicit === "ACTIVE" ||
    explicit === "PENDING" ||
    explicit === "VERIFYING" ||
    explicit === "VERIFIED" ||
    explicit === "REQUIRES_ACTION" ||
    explicit === "DISABLED" ||
    explicit === "REJECTED" ||
    explicit === "REPLACED"
  ) {
    return explicit as BankAccountDisplayStatus;
  }
  if (row.isActiveDestination) return "ACTIVE";
  return "UNKNOWN";
}
