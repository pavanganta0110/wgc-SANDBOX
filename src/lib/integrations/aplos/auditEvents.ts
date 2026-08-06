/**
 * DashboardAuditLog action strings for the Aplos integration — matches this
 * codebase's existing convention of plain string action values (no Prisma
 * enum), logged via src/lib/dashboardAudit.ts's logDashboardAction().
 *
 * Metadata rules (enforced by callers, not by this file): may include a
 * masked organization identifier, the key fingerprint, a success/failure
 * category, and a timestamp. Must NEVER include a private key, access
 * token, Authorization header, full credential payload, or raw Aplos
 * response body.
 */
export const APLOS_AUDIT_EVENTS = {
  CONNECTION_TESTED: "APLOS_CONNECTION_TESTED",
  CONNECTED: "APLOS_CONNECTED",
  CONNECTION_FAILED: "APLOS_CONNECTION_FAILED",
  DISCONNECTED: "APLOS_DISCONNECTED",
  CONFIGURATION_UPDATED: "APLOS_CONFIGURATION_UPDATED",
  MAPPING_UPDATED: "APLOS_MAPPING_UPDATED",
  AUTOMATIC_SYNC_ENABLED: "APLOS_AUTOMATIC_SYNC_ENABLED",
  AUTOMATIC_SYNC_DISABLED: "APLOS_AUTOMATIC_SYNC_DISABLED",
  SYNC_STARTED: "APLOS_SYNC_STARTED",
  SYNC_SUCCEEDED: "APLOS_SYNC_SUCCEEDED",
  SYNC_FAILED: "APLOS_SYNC_FAILED",
  SYNC_RETRIED: "APLOS_SYNC_RETRIED",
  SYNC_BLOCKED: "APLOS_SYNC_BLOCKED",
  SYNC_NEEDS_REVIEW: "APLOS_SYNC_NEEDS_REVIEW",
  RESOURCE_INVALIDATED: "APLOS_RESOURCE_INVALIDATED",
  MANUAL_RETRY_REQUESTED: "APLOS_MANUAL_RETRY_REQUESTED",
} as const;

/** Masks an Aplos account/organization identifier for safe audit-log
 * metadata — same shape as this codebase's existing credential-masking
 * conventions (e.g. finixMerchantIdentityPrefix logging in donate/route.ts):
 * first 2 and last 4 characters only. */
export function maskAplosAccountId(accountId: string): string {
  if (accountId.length <= 6) return "***";
  return `${accountId.slice(0, 2)}...${accountId.slice(-4)}`;
}
