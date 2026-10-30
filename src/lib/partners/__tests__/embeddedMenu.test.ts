import { describe, it, expect } from "vitest";
import { EMBEDDED_MENU_ALWAYS_ON, EMBEDDED_MENU_CATALOG, allowedEmbeddedHrefs, buildEmbeddedMenuChoice, newEmbeddedMenuItems } from "../embeddedMenu";
import { NAV_ITEMS, visibleNavItems, type NavAccess } from "@/components/merchant/Sidebar";

const access = (embeddedMenu: string[] | null): NavAccess => ({
  canViewEvents: true,
  canViewFundraisingCampaigns: true,
  canTakePayment: true,
  canViewFunds: true,
  canViewStudents: true,
  canViewBillingPlan: true,
  embeddedMenu,
});

describe("embedded menu", () => {
  it("lists every sidebar item a partner could choose, except the billing plan which partner organizations never have", () => {
    const sidebar = NAV_ITEMS.map((i) => i.href).filter((h) => h !== "/merchant/subscription").sort();
    expect(EMBEDDED_MENU_CATALOG.map((i) => i.href).sort()).toEqual(sidebar);
  });

  it("shows everything until a choice is saved", () => {
    expect(allowedEmbeddedHrefs(null)).toBeNull();
    expect(allowedEmbeddedHrefs("junk")).toBeNull();
    expect(visibleNavItems("owner", access(null)).length).toBe(NAV_ITEMS.length);
  });

  it("a saved choice shows only the ticked items plus the always-on ones", () => {
    const saved = buildEmbeddedMenuChoice(["/merchant/donors", "/not/real"]);
    expect(saved.allowed.sort()).toEqual(["/merchant/dashboard", "/merchant/donors", "/merchant/support"]);
    const names = visibleNavItems("admin", access(allowedEmbeddedHrefs(saved))).map((i) => i.name);
    expect(names.sort()).toEqual(["Donors", "Home", "Support"]);
    for (const href of EMBEDDED_MENU_ALWAYS_ON) expect(saved.allowed).toContain(href);
  });

  it("an item WGC adds later stays hidden and is flagged new until saved again", () => {
    const saved = buildEmbeddedMenuChoice(["/merchant/donors"]);
    const older = { allowed: saved.allowed, known: saved.known.filter((h) => h !== "/merchant/events") };
    expect(newEmbeddedMenuItems(older).map((i) => i.href)).toEqual(["/merchant/events"]);
    expect(allowedEmbeddedHrefs(older)).not.toContain("/merchant/events");
    expect(newEmbeddedMenuItems(saved)).toEqual([]);
  });
});
