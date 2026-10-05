/**
 * The full scope catalog for merchant-issued API keys (/api/v1/*). Deliberately
 * never includes anything that would expose Finix processor credentials,
 * bank account numbers, or another organization's data — those never have
 * a scope at all because no /api/v1 route ever returns them, regardless of
 * what a key is granted.
 */
export const API_SCOPES = [
  "donors:read",
  "donors:write",
  "donations:read",
  "campaigns:read",
  "campaigns:write",
  "fundraisers:read",
  "fundraisers:write",
  "teams:read",
  "teams:write",
  "invoices:read",
  "invoices:write",
  "giving-links:read",
  "giving-links:write",
  "transactions:read",
  "recurring:read",
  "settlements:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}
