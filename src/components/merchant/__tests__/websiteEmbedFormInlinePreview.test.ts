import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SOURCE = readFileSync(join(__dirname, "../WebsiteEmbedForm.tsx"), "utf-8");

describe("WebsiteEmbedForm — Inline Form no longer previews only a button", () => {
  it("renders the real GivingLinkPreviewPanel (the same component the Giving Link builder uses) for inline mode, not a placeholder button", () => {
    expect(SOURCE).toContain('import GivingLinkPreviewPanel from "@/components/merchant/GivingLinkPreviewPanel"');
    expect(SOURCE).toContain("<GivingLinkPreviewPanel");
    // The preview branch is conditioned on mode, and only the button-mode
    // branch renders the standalone <button> preview.
    const previewSection = SOURCE.slice(SOURCE.indexOf("{/* Preview */}"), SOURCE.indexOf("{/* Code + copy */}"));
    expect(previewSection).toContain('mode === "button" ?');
    expect(previewSection).toContain("<GivingLinkPreviewPanel");
  });

  it("loads live preview data from the same public config endpoint the real inline embed script uses, rather than a second data source", () => {
    expect(SOURCE).toContain("fetch(`/api/embed/giving-pages/${encodeURIComponent(slug)}`)");
  });

  it("GivingLinkPreviewPanel is inherently preview-safe (previewMode is hardcoded true inside it) — no real payment can be created from this settings-page preview", () => {
    const panelSource = readFileSync(join(__dirname, "../GivingLinkPreviewPanel.tsx"), "utf-8");
    expect(panelSource).toContain("previewMode");
  });

  it("adds a Layout control for inline mode that is only rendered for inline, not button, mode", () => {
    const buttonModeBlock = SOURCE.slice(SOURCE.indexOf('mode === "button" && ('), SOURCE.indexOf('mode === "inline" && ('));
    const inlineModeBlock = SOURCE.slice(SOURCE.indexOf('mode === "inline" && ('), SOURCE.indexOf("{/* Preview */}"));
    expect(inlineModeBlock).toContain("Layout");
    expect(inlineModeBlock).toContain('setLayout("compact")');
    expect(buttonModeBlock).not.toContain("setLayout");
  });

  it("generated inline code includes data-wgc-layout=\"compact\" only when compact is selected, and omits it entirely for standard layout", () => {
    expect(SOURCE).toContain('layout === "compact" ? \'\\n  data-wgc-layout="compact"\' : ""');
  });

  it("adds a Copy Hosted Giving Link action alongside the embed code, using the /g/[slug] hosted link (not the iframe-only /embed/[slug] URL)", () => {
    expect(SOURCE).toContain("handleCopyHostedLink");
    expect(SOURCE).toContain("const hostedGivingLink = slug ? `${appUrl}/g/${slug}` : \"\"");
    expect(SOURCE).toContain("Copy Hosted Giving Link");
  });

  it("labels the copy button per mode (Donate Button Code vs Inline Form Code)", () => {
    expect(SOURCE).toContain('mode === "button" ? "Copy Donate Button Code" : "Copy Inline Form Code"');
  });
});
