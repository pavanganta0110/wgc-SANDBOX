/**
 * The full integration catalog shown on the merchant Integrations page,
 * organized by category. A provider with a real, working connection
 * (QuickBooks, Aplos, Printful today) is rendered as its own live card
 * with real per-organization status by the page itself — it is NOT listed
 * here, to avoid ever showing two different status sources for the same
 * provider. This catalog is exclusively for providers with NO connection
 * built yet, so every entry here is always "Coming Soon" — never claim
 * otherwise just because a marketing page mentions a provider.
 *
 * When a new provider is actually built (using the generic
 * IntegrationConnection model — see prisma/schema.prisma), move it out of
 * this static catalog and into its own real status card, the same way
 * QuickBooks/Aplos/Printful already work.
 */
export type IntegrationCategory = "Accounting" | "CRM" | "Church Management" | "Marketing" | "Automation";

export interface CatalogIntegration {
  name: string;
  category: IntegrationCategory;
  description: string;
}

export const INTEGRATION_CATALOG: CatalogIntegration[] = [
  { name: "Salesforce", category: "CRM", description: "Sync donor and gift records with Salesforce Nonprofit Cloud." },
  { name: "HubSpot", category: "CRM", description: "Sync donor and contact records with HubSpot CRM." },
  { name: "Bloomerang", category: "CRM", description: "Sync donor and gift records with Bloomerang." },
  { name: "Virtuous", category: "CRM", description: "Sync donor and gift records with Virtuous." },
  { name: "Planning Center", category: "Church Management", description: "Sync people and giving records with Planning Center." },
  { name: "HighLevel", category: "Marketing", description: "Trigger HighLevel workflows from WGC events." },
  { name: "Zapier", category: "Automation", description: "Connect WGC to thousands of apps via Zapier — powered by the same events and API used by webhooks and /api/v1." },
  { name: "Make", category: "Automation", description: "Connect WGC to Make (formerly Integromat) scenarios." },
];

export const CATEGORY_ORDER: IntegrationCategory[] = ["Accounting", "CRM", "Church Management", "Marketing", "Automation"];
