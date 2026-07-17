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
  { key: "annual-statements", label: "Annual Statements", href: "/merchant/settings/annual-statements" },
  { key: "notifications", label: "Notifications", href: "/merchant/settings/notifications" },
  { key: "team", label: "Team & Access", href: "/merchant/settings/team" },
  { key: "security", label: "Security", href: "/merchant/settings/security" },
  { key: "branding", label: "Branding", href: "/merchant/settings/branding" },
  { key: "integrations", label: "Integrations", href: "/merchant/settings/integrations" },
  { key: "embed", label: "Website Embed", href: "/merchant/settings/embed" },
  { key: "sync", label: "Webhooks & Sync", href: "/merchant/settings/sync" },
  { key: "data-privacy", label: "Data & Privacy", href: "/merchant/settings/data-privacy" },
  { key: "audit", label: "Audit History", href: "/merchant/settings/audit" },
];
