import { describe, it, expect } from "vitest";
import { buildPortalButtonSnippet, readableTextColor, PORTAL_BUTTON_LABELS } from "../websiteSnippet";

describe("readableTextColor", () => {
  it("uses white on dark brand colors and near-black on light ones", () => {
    expect(readableTextColor("#0B5DBC")).toBe("#ffffff");
    expect(readableTextColor("#000000")).toBe("#ffffff");
    expect(readableTextColor("#FFD400")).toBe("#0f172a");
    expect(readableTextColor("#ffffff")).toBe("#0f172a");
  });
  it("falls back to white for anything that isn't a 6-digit hex", () => {
    expect(readableTextColor("red")).toBe("#ffffff");
    expect(readableTextColor("")).toBe("#ffffff");
  });
});

describe("buildPortalButtonSnippet", () => {
  const url = "https://www.wgcpayments.com/give/liberty/account";

  it("is one self-contained link in the church's brand color — no script, stylesheet or tracking", () => {
    const html = buildPortalButtonSnippet({ url, label: "My Giving", accent: "#0B5DBC" });
    expect(html).toMatch(/^<a href="https:\/\/www\.wgcpayments\.com\/give\/liberty\/account" style="[^"]+">My Giving<\/a>$/);
    expect(html).toContain("background:#0B5DBC");
    expect(html).toContain("color:#ffffff");
    expect(html).not.toMatch(/<script|<link|<img|onclick|javascript:/i);
  });

  it("links only to the portal page — no token or credential", () => {
    const html = buildPortalButtonSnippet({ url, label: "Donor Login", accent: "#4f46e5" });
    expect([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual([url]);
  });

  it("escapes the label and URL so neither can break out of the markup", () => {
    const html = buildPortalButtonSnippet({ url: 'https://x.test/a"b<c', label: '"><script>alert(1)</script>', accent: "#000000" });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
    expect(html).toContain('href="https://x.test/a&quot;b&lt;c"');
  });

  it("offers the labels the card shows", () => {
    expect(PORTAL_BUTTON_LABELS).toContain("My Giving");
    expect(PORTAL_BUTTON_LABELS).toContain("Donor Login");
  });
});
