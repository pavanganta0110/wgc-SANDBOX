/**
 * WGC product-policy limits — deliberately separate from any Finix
 * processor limit, which Finix's public documentation does not publish and
 * which this codebase has not confirmed. Configurable via env var so
 * support can adjust without a code change; never used to delete accounts
 * with deposit history (see checkHistoricalAccountCount below).
 */
export const PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS = Number(process.env.PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS || 1);
export const PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS = Number(process.env.PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS || 25);

/**
 * Informational only — never triggers deletion. Accounts with deposit
 * history must be preserved regardless of count. Used to flag an
 * organization for a support review of its bank-account history size, not
 * to block or remove anything automatically.
 */
export function exceedsHistoricalAccountLimit(historicalAccountCount: number): boolean {
  return historicalAccountCount > PAYOUT_ACCOUNT_MAX_STORED_HISTORICAL_ACCOUNTS;
}
