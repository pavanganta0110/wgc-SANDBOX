/**
 * Two kinds of partner, with different dashboards:
 *  - SOFTWARE: a software company (for example a CRM) whose customers use WGC. Sees its organizations, API key,
 *    webhook, menu, billing and team.
 *  - REFERRAL: an ISO or reseller that brings clients to WGC and earns a share of WGC's profit, shared with its
 *    agents. Sees volume, transactions, commission and team. No API, webhook, menu or billing.
 */
export const PARTNER_TYPES = ["SOFTWARE", "REFERRAL"] as const;
export type PartnerType = (typeof PARTNER_TYPES)[number];

export function parsePartnerType(value: unknown): PartnerType {
  return value === "REFERRAL" ? "REFERRAL" : "SOFTWARE";
}

export const isPartnerType = (value: unknown): value is PartnerType => PARTNER_TYPES.includes(value as PartnerType);

export const PARTNER_TYPE_LABEL: Record<PartnerType, string> = { SOFTWARE: "Software partner", REFERRAL: "Referral partner" };

export type PartnerNavItem = { name: string; href: string };

/** Menu hrefs each kind of login may see. An agent is always limited to their own clients' pages. */
export const SOFTWARE_NAV_HREFS = ["/partner/organizations", "/partner/api-keys", "/partner/webhook", "/partner/menu", "/partner/billing", "/partner/team", "/partner/docs"];
export const REFERRAL_NAV_HREFS = ["/partner/volume", "/partner/transactions", "/partner/commissions", "/partner/team"];
export const AGENT_NAV_HREFS = ["/partner/volume", "/partner/transactions", "/partner/commissions"];

export function navHrefsFor(type: PartnerType, isAgent: boolean): string[] {
  if (isAgent) return AGENT_NAV_HREFS;
  return type === "REFERRAL" ? REFERRAL_NAV_HREFS : SOFTWARE_NAV_HREFS;
}
