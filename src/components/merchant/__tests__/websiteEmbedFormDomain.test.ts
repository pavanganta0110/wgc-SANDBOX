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

describe("WebsiteEmbedForm — Wix inline form uses the no-iframe Custom Code path", () => {
  it("generates a Custom Code snippet (not <div data-wgc-giving>) when the Wix platform panel is open in inline mode, since Wix's Embed HTML element always iframes its content and Finix refuses to render card fields inside any iframe", () => {
    expect(SOURCE).toContain('const isWixInline = openPlatform === "wix" && mode === "inline"');
    expect(SOURCE).toContain('document.getElementById("${containerId}")');
    expect(SOURCE).toContain('container.appendChild(el)');
  });

  it("falls back to the container ID placeholder until the merchant pastes their Wix element's real ID", () => {
    expect(SOURCE).toContain('const containerId = wixContainerId.trim() || "REPLACE_WITH_YOUR_CONTAINER_ID"');
  });

  it("shows Wix-specific setup steps (Custom Code, not Embed HTML) only for the inline form", () => {
    expect(SOURCE).toContain("WIX_INLINE_STEPS");
    expect(SOURCE).toContain("Settings, scroll to Custom Code");
    expect(SOURCE).toContain('(p.key === "wix" && mode === "inline" ? WIX_INLINE_STEPS : p.steps)');
  });
});
