import { describe, it, expect } from "vitest";
import { resolveDashboardBrand } from "@/lib/organization/dashboardBrand";

const saved = { logoUrl: "https://cdn.example.com/mbts.png", primaryColor: "#1f3a5f", accentColor: "#c8a24a" };

describe("resolveDashboardBrand", () => {
  it("is off unless the organization has the branded dashboard switched on", () => {
    expect(resolveDashboardBrand({ ...saved })).toBeNull();
    expect(resolveDashboardBrand({ ...saved, brandedDashboard: false })).toBeNull();
  });

  it("returns the saved logo and colors when switched on", () => {
    expect(resolveDashboardBrand({ ...saved, brandedDashboard: true })).toEqual(saved);
  });

  it("drops values that are not safe to render", () => {
    expect(
      resolveDashboardBrand({
        brandedDashboard: true,
        logoUrl: "javascript:alert(1)",
        primaryColor: "red; background:url(x)",
        accentColor: "#12345",
      })
    ).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
    expect(resolveDashboardBrand({ brandedDashboard: true, logoUrl: "http://insecure.example/logo.png" })?.logoUrl).toBeNull();
    expect(resolveDashboardBrand({ brandedDashboard: true, logoUrl: "not a url" })?.logoUrl).toBeNull();
  });

  it("tolerates an organization with no branding saved", () => {
    expect(resolveDashboardBrand({ brandedDashboard: true })).toEqual({ logoUrl: null, primaryColor: null, accentColor: null });
  });
});
