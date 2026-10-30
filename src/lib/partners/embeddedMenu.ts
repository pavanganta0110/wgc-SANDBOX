/**
 * The sidebar items a partner chooses to show its organizations inside its own frame
 * (a CRM). Until the partner saves a choice everything shows. A saved choice is an
 * allow-list: an item WGC adds later is not in `known`, so it stays hidden until the
 * partner ticks it, and the Menu page marks it as new.
 *
 * This hides links; it does not lock pages. The same people can still open a page by
 * signing in to WGC directly, and what they may do is decided by their role either way.
 */

export interface EmbeddedMenuItem {
  /** The item's link in the sidebar; the identity of the item. */
  href: string;
  name: string;
  section: "Overview" | "Money" | "Giving" | "Back Office" | "Organization";
}

/** Every top-level sidebar item a partner can choose. Kept in step with the sidebar by a test. */
export const EMBEDDED_MENU_CATALOG: EmbeddedMenuItem[] = [
  { href: "/merchant/dashboard", name: "Home", section: "Overview" },
  { href: "/merchant/insights", name: "Insights", section: "Overview" },
  { href: "/merchant/reporting", name: "Reporting", section: "Overview" },
  { href: "/merchant/transactions", name: "Transactions", section: "Money" },
  { href: "/merchant/disputes", name: "Disputes", section: "Money" },
  { href: "/merchant/settlements", name: "Settlements", section: "Money" },
  { href: "/merchant/deposits", name: "Deposits", section: "Money" },
  { href: "/merchant/recurring-donors", name: "Recurring Donors", section: "Money" },
  { href: "/merchant/subscriptions", name: "Subscriptions", section: "Money" },
  { href: "/merchant/transactions/payments?takePayment=1", name: "Take a Payment", section: "Giving" },
  { href: "/merchant/donors", name: "Donors", section: "Giving" },
  { href: "/merchant/giving-links", name: "Giving Links", section: "Giving" },
  { href: "/merchant/students", name: "Students", section: "Giving" },
  { href: "/merchant/funds", name: "Funds", section: "Giving" },
  { href: "/merchant/giving-campaigns", name: "Giving Campaigns", section: "Giving" },
  { href: "/merchant/donations/external", name: "External Donations", section: "Giving" },
  { href: "/merchant/pledges", name: "Pledges", section: "Giving" },
  { href: "/merchant/campaigns", name: "Fundraising Campaigns", section: "Giving" },
  { href: "/merchant/events", name: "Events", section: "Giving" },
  { href: "/merchant/text-to-give", name: "Text to Give", section: "Giving" },
  { href: "/merchant/migrations", name: "Migration Center", section: "Giving" },
  { href: "/merchant/invoices", name: "Invoices", section: "Giving" },
  { href: "/merchant/merchandise", name: "Merchandise", section: "Giving" },
  { href: "/merchant/email-logs", name: "Email Logs", section: "Back Office" },
  { href: "/merchant/compliance", name: "Compliance", section: "Organization" },
  { href: "/merchant/settings/team", name: "Team", section: "Organization" },
  { href: "/merchant/settings", name: "Settings", section: "Organization" },
  { href: "/merchant/support", name: "Support", section: "Organization" },
  { href: "/merchant/organization", name: "Company", section: "Organization" },
];

/** Always shown, so a merchant can never be left without a way home or to help. */
export const EMBEDDED_MENU_ALWAYS_ON = ["/merchant/dashboard", "/merchant/support"];

export interface EmbeddedMenuChoice {
  allowed: string[];
  known: string[];
}

const catalogHrefs = new Set(EMBEDDED_MENU_CATALOG.map((i) => i.href));

/** Reads what is stored; anything unexpected means "no choice saved", never "hide everything". */
export function parseEmbeddedMenu(raw: unknown): EmbeddedMenuChoice | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const { allowed, known } = raw as Record<string, unknown>;
  if (!Array.isArray(allowed) || !Array.isArray(known)) return null;
  return { allowed: allowed.filter((v): v is string => typeof v === "string"), known: known.filter((v): v is string => typeof v === "string") };
}

/** A choice to save from the ticked links: only real items, the always-on ones included, and every current item marked as seen. */
export function buildEmbeddedMenuChoice(ticked: unknown): EmbeddedMenuChoice {
  const picked = Array.isArray(ticked) ? ticked.filter((v): v is string => typeof v === "string" && catalogHrefs.has(v)) : [];
  return { allowed: [...new Set([...EMBEDDED_MENU_ALWAYS_ON, ...picked])], known: EMBEDDED_MENU_CATALOG.map((i) => i.href) };
}

/** The links the sidebar may show inside the frame, or null for "all". */
export function allowedEmbeddedHrefs(raw: unknown): string[] | null {
  const choice = parseEmbeddedMenu(raw);
  return choice ? [...new Set([...choice.allowed, ...EMBEDDED_MENU_ALWAYS_ON])] : null;
}

/** Catalog items WGC added since the partner last saved. */
export function newEmbeddedMenuItems(raw: unknown): EmbeddedMenuItem[] {
  const choice = parseEmbeddedMenu(raw);
  if (!choice) return [];
  const known = new Set(choice.known);
  return EMBEDDED_MENU_CATALOG.filter((i) => !known.has(i.href));
}
