import { describe, it, expect, vi, afterEach } from "vitest";
import { donorPortalUrl, donorPortalLinkParagraph } from "../portalLink";

afterEach(() => vi.unstubAllEnvs());

describe("portal link for donor emails", () => {
  it("builds the church's portal page URL from its slug", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    expect(donorPortalUrl("liberty")).toBe("https://app.example.com/give/liberty/account");
  });

  it("falls back to the production app URL when none is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(donorPortalUrl("liberty")).toBe("https://www.wgcpayments.com/give/liberty/account");
  });

  it("renders a paragraph whose only link is the portal page — no token or credential", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    const html = donorPortalLinkParagraph("liberty");
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["https://app.example.com/give/liberty/account"]);
  });

  it("renders nothing when the church slug is unknown", () => {
    expect(donorPortalLinkParagraph(null)).toBe("");
    expect(donorPortalLinkParagraph(undefined)).toBe("");
  });
});
