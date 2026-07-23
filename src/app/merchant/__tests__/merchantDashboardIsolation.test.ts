import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const DASHBOARD_LAYOUT = readFileSync(join(__dirname, "../(dashboard)/layout.tsx"), "utf-8");
const LOGIN_PAGE = readFileSync(join(__dirname, "../login/page.tsx"), "utf-8");
const LOGIN_FORM = readFileSync(join(__dirname, "../login/MerchantLoginForm.tsx"), "utf-8");
const SIDEBAR = readFileSync(join(__dirname, "../../../components/merchant/Sidebar.tsx"), "utf-8");

describe("Merchant dashboard layout — no public marketing chrome", () => {
  it("does not import the public site Header or Footer", () => {
    expect(DASHBOARD_LAYOUT).not.toContain('from "@/components/layout/Header"');
    expect(DASHBOARD_LAYOUT).not.toContain('from "@/components/layout/Footer"');
  });

  it("still enforces requireMerchantSession() and redirects to /merchant/login on auth failure", () => {
    expect(DASHBOARD_LAYOUT).toContain("requireMerchantSession()");
    expect(DASHBOARD_LAYOUT).toContain('redirect("/merchant/login")');
  });

  it("displays the organization name", () => {
    expect(DASHBOARD_LAYOUT).toContain("{church.name}");
  });
});

describe("Merchant login page — session-aware redirect", () => {
  it("redirects an already-authenticated merchant to /merchant/dashboard server-side", () => {
    expect(LOGIN_PAGE).toContain("requireMerchantSession()");
    expect(LOGIN_PAGE).toContain('redirect("/merchant/dashboard")');
  });

  it("uses router.replace (not push) after login so back doesn't return to the login page", () => {
    expect(LOGIN_FORM).toContain('router.replace("/merchant/dashboard")');
    expect(LOGIN_FORM).not.toContain('router.push("/merchant/dashboard")');
  });

  it("keeps the public marketing Header/Footer on the login page itself (public route)", () => {
    expect(LOGIN_FORM).toContain('from "@/components/layout/Header"');
    expect(LOGIN_FORM).toContain('from "@/components/layout/Footer"');
  });
});

describe("Merchant sidebar — section coverage", () => {
  it("includes a Team link", () => {
    expect(SIDEBAR).toContain('{ name: "Team", href: "/merchant/settings/team"');
  });
});
