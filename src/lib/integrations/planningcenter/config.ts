import { PlanningCenterConfigError } from "./errors";

// Same pasted-env-value hygiene as quickbooks/config.ts: a trailing newline
// or wrapping quotes in a dashboard env editor silently breaks the OAuth
// client id rather than failing loudly.
function normalizeEnvValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  let v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1);
  }
  return v === "" ? undefined : v;
}

/**
 * All Planning Center env vars are read lazily and fail closed only at the
 * point of real use, so `next build` never fails because they are unset.
 * WGC registers ONE OAuth application with Planning Center; every church
 * authorizes that same application (churches never create their own).
 */

export const PLANNING_CENTER_API_BASE_URL = "https://api.planningcenteronline.com";
export const PLANNING_CENTER_AUTHORIZE_URL = `${PLANNING_CENTER_API_BASE_URL}/oauth/authorize`;
export const PLANNING_CENTER_TOKEN_URL = `${PLANNING_CENTER_API_BASE_URL}/oauth/token`;
export const PLANNING_CENTER_REVOKE_URL = `${PLANNING_CENTER_API_BASE_URL}/oauth/revoke`;

/** Phase 1 reads People (identity) and Giving (permission probe). */
export const PLANNING_CENTER_SCOPES = "giving people";

/** Global kill switch. Defaults to false: the integration is opt-in per
 * environment until a pilot church is ready (see rollout in the plan). */
export function isPlanningCenterIntegrationEnabled(): boolean {
  const raw = process.env.PLANNING_CENTER_INTEGRATION_ENABLED;
  if (raw === undefined) return false;
  return raw.trim().toLowerCase() === "true";
}

/**
 * Platform kill switch for GIFT SYNC specifically (phase 4), separate from
 * the integration flag so connecting/mapping can be live while no sync runs.
 * Defaults to OFF. Applies to dry runs as well as live runs: when it is off,
 * the cron and "Sync now" do nothing at all.
 */
export function isPlanningCenterSyncEnabled(): boolean {
  if (!isPlanningCenterIntegrationEnabled()) return false;
  const raw = process.env.PLANNING_CENTER_SYNC_ENABLED;
  if (raw === undefined) return false;
  return raw.trim().toLowerCase() === "true";
}

/** True once the WGC OAuth application's credentials are present. */
export function isPlanningCenterIntegrationConfigured(): boolean {
  return Boolean(
    normalizeEnvValue(process.env.PLANNING_CENTER_CLIENT_ID) &&
      normalizeEnvValue(process.env.PLANNING_CENTER_CLIENT_SECRET) &&
      normalizeEnvValue(process.env.PLANNING_CENTER_REDIRECT_URI)
  );
}

export interface PlanningCenterOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string;
}

export function getPlanningCenterOAuthConfig(): PlanningCenterOAuthConfig {
  const clientId = normalizeEnvValue(process.env.PLANNING_CENTER_CLIENT_ID);
  const clientSecret = normalizeEnvValue(process.env.PLANNING_CENTER_CLIENT_SECRET);
  const redirectUri = normalizeEnvValue(process.env.PLANNING_CENTER_REDIRECT_URI);
  if (!clientId || !clientSecret || !redirectUri) {
    throw new PlanningCenterConfigError(
      "PLANNING_CENTER_CLIENT_ID / PLANNING_CENTER_CLIENT_SECRET / PLANNING_CENTER_REDIRECT_URI are not configured. Create an OAuth application in a WGC-owned Planning Center organization and set these as server-only environment variables."
    );
  }
  return { clientId, clientSecret, redirectUri, scopes: PLANNING_CENTER_SCOPES };
}

/** Planning Center asks every request to carry an identifying User-Agent
 * and may answer 403 without one. */
export function getPlanningCenterUserAgent(): string {
  return normalizeEnvValue(process.env.PLANNING_CENTER_USER_AGENT) || "WGC Payments (https://wgcpayments.com)";
}
