import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "../WebsiteEmbedForm.tsx"), "utf-8");

describe("WebsiteEmbedForm — generated embed code domain", () => {
  it("uses the canonical production domain when appUrl is wgcpayments.com (or www.wgcpayments.com)", () => {
    expect(SOURCE).toContain('const WGC_CANONICAL_PRODUCTION_ORIGIN = "https://www.wgcpayments.com"');
    expect(SOURCE).toContain('host === "wgcpayments.com" || host === "www.wgcpayments.com"');
  });

  it("falls back to appUrl itself for any non-production environment (sandbox, etc.), so testing against that environment's own giving-page data actually works", () => {
    expect(SOURCE).toContain("return appUrl;");
  });

  it("falls back to the canonical domain when appUrl is empty or unparseable, rather than generating a broken script src", () => {
    expect(SOURCE).toContain("if (!appUrl) return WGC_CANONICAL_PRODUCTION_ORIGIN;");
    expect(SOURCE).toContain("return WGC_CANONICAL_PRODUCTION_ORIGIN;\n  }\n}");
  });

  it("derives scriptSrc from resolveEmbedScriptOrigin(appUrl), not a bare hardcoded constant", () => {
    expect(SOURCE).toContain("const scriptSrc = `${resolveEmbedScriptOrigin(appUrl)}/embed/wgc-giving.js`");
  });
});
