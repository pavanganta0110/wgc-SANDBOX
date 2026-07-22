import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "../WebsiteEmbedForm.tsx"), "utf-8");

describe("WebsiteEmbedForm — generated embed code domain", () => {
  it("hardcodes the canonical production domain for the embed script src", () => {
    expect(SOURCE).toContain('const WGC_EMBED_SCRIPT_ORIGIN = "https://www.wgcpayments.com"');
    expect(SOURCE).toContain("const scriptSrc = `${WGC_EMBED_SCRIPT_ORIGIN}/embed/wgc-giving.js`");
  });

  it("never derives the generated <script src> from appUrl (which is a Vercel preview/sandbox domain, not canonical)", () => {
    const scriptSrcLine = SOURCE.split("\n").find((l) => l.includes("const scriptSrc ="));
    expect(scriptSrcLine).toBeDefined();
    expect(scriptSrcLine).not.toContain("${appUrl}");
  });
});
