export interface SettingsNavItem {
  key: string;
  label: string;
  href: string;
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { key: "general", label: "General", href: "/merchant/settings/general" },
  { key: "giving", label: "Giving", href: "/merchant/settings/giving" },
  { key: "payment-methods", label: "Payment Methods", href: "/merchant/settings/payment-methods" },
  { key: "fees", label: "Fees", href: "/merchant/settings/fees" },
  { key: "receipts", label: "Receipts", href: "/merchant/settings/receipts" },
  { key: "invoicing", label: "Invoicing", href: "/merchant/settings/invoicing" },
  { key: "annual-statements", label: "Annual Statements", href: "/merchant/settings/annual-statements" },
  { key: "notifications", label: "Notifications", href: "/merchant/settings/notifications" },
  { key: "team", label: "Team & Access", href: "/merchant/settings/team" },
  { key: "security", label: "Security", href: "/merchant/settings/security" },
  { key: "branding", label: "Branding", href: "/merchant/settings/branding" },
  { key: "integrations", label: "Integrations", href: "/merchant/settings/integrations" },
  { key: "embed", label: "Website Embed", href: "/merchant/settings/embed" },
  { key: "sync", label: "Webhooks & Sync", href: "/merchant/settings/sync" },
  // Developer platform — distinct from "Webhooks & Sync" above (that page
  // shows inbound processor sync history; these are outbound webhooks a
  // merchant configures to notify their OWN systems, plus API key
  // management for /api/v1).
  { key: "developer-webhooks", label: "Developer Webhooks", href: "/merchant/settings/developers/webhooks" },
  { key: "api-keys", label: "API Keys", href: "/merchant/settings/developers/api-keys" },
  { key: "data-privacy", label: "Data & Privacy", href: "/merchant/settings/data-privacy" },
  { key: "audit", label: "Audit History", href: "/merchant/settings/audit" },
];
