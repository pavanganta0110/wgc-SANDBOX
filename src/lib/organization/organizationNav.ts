export interface OrganizationNavItem {
  key: string;
  label: string;
  href: string;
}

export const ORGANIZATION_NAV: OrganizationNavItem[] = [
  { key: "overview", label: "Overview", href: "/merchant/organization/overview" },
  { key: "verification", label: "Verification", href: "/merchant/organization/verification" },
  { key: "bank-account", label: "Bank Account", href: "/merchant/organization/bank-account" },
  { key: "payment-processing", label: "Payment Processing", href: "/merchant/organization/payment-processing" },
  { key: "documents", label: "Documents", href: "/merchant/organization/documents" },
  { key: "contacts", label: "Contacts", href: "/merchant/organization/contacts" },
  { key: "activity", label: "Activity", href: "/merchant/organization/activity" },
];
