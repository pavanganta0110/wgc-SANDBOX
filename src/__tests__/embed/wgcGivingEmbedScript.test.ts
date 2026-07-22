import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import vm from "vm";

const SOURCE = readFileSync(join(__dirname, "../../../public/embed/wgc-giving.js"), "utf-8");

describe("public/embed/wgc-giving.js — source integrity", () => {
  it("is syntactically valid JavaScript", () => {
    expect(() => new vm.Script(SOURCE)).not.toThrow();
  });

  it("never self-hosts or bundles finix.js — always loads it live from js.finix.com", () => {
    expect(SOURCE).toContain("https://js.finix.com/v/2/finix.js");
  });

  it("inline mode no longer just calls createGivingButton() — it renders the full form via renderForm()", () => {
    const initInlineMatch = SOURCE.match(/function initInline\([\s\S]*?\n  \}\n/);
    expect(initInlineMatch).not.toBeNull();
    const initInlineBody = initInlineMatch![0];
    expect(initInlineBody).not.toContain("createGivingButton(");
    expect(initInlineBody).toContain("fetch(");
  });

  it("renderForm() includes every field required by the inline-mode spec", () => {
    const requiredMarkers = [
      "wgc-inline-logo",
      "cfg.givingPage.title",
      "cfg.givingPage.description",
      'data-role="fund"',
      'data-role="amounts"',
      'data-role="custom-amount"',
      'data-role="frequency-toggle"',
      'donorFieldHtml(df.firstName, "first-name"',
      'donorFieldHtml(df.lastName, "last-name"',
      'donorFieldHtml(df.email, "email"',
      'donorFieldHtml(df.phone, "phone"',
      'data-role="cover-fees"',
      'data-role="method-toggle"',
      'data-role="finix-mount"',
      'data-role="submit"',
      "wgc-inline-terms",
      "showPoweredByWgc",
      'data-role="validation"',
      'data-role="success"',
    ];
    for (const marker of requiredMarkers) {
      expect(SOURCE, `expected renderForm() output to include ${marker}`).toContain(marker);
    }
  });

  it("mounts Finix.PaymentForm directly into a uniquely-IDed host-DOM element (no WGC iframe involved)", () => {
    expect(SOURCE).toContain("window.Finix.PaymentForm(mountEl.id");
    expect(SOURCE).toContain('id="wgc-finix-form-\' + state.id');
  });

  it("never builds a nested WGC iframe for inline mode — <iframe> only ever appears in popup-window comments/docs, never as constructed markup", () => {
    expect(SOURCE).not.toMatch(/createElement\(\s*["']iframe["']\s*\)/);
    expect(SOURCE).not.toMatch(/<iframe/);
  });

  it("submits donations to the shared /api/g/[slug]/donate endpoint rather than a separate embed-only payment route", () => {
    expect(SOURCE).toContain('"/api/g/" + encodeURIComponent(state.slug) + "/donate"');
  });

  it("loads public configuration from the dedicated embed config endpoint", () => {
    expect(SOURCE).toContain('"/api/embed/giving-pages/" + encodeURIComponent(slug)');
  });

  it("gives every inline instance its own generated id rather than relying only on document.currentScript", () => {
    expect(SOURCE).toContain("function nextInstanceId()");
    expect(SOURCE).toContain("instanceCounter");
  });

  it("wallet fallback opens the hosted giving page instead of rendering an inline button that can't complete", () => {
    expect(SOURCE).toContain("Continue securely to use Apple Pay");
    expect(SOURCE).toContain("Continue securely to use Google Pay");
    expect(SOURCE).toContain("openWgcPopup(state.config.hostedGivingUrl");
  });

  it("never fails silently — network/config/init failures all call showValidation/renderError with a message", () => {
    expect(SOURCE).toContain('showValidation(state, "The secure payment form failed to load. Please refresh the page and try again.")');
    expect(SOURCE).toContain('showValidation(state, "A network error occurred while submitting your donation. Please check your connection and try again.")');
    expect(SOURCE).toContain("renderError(state,");
  });

  it("button mode is left intact (still builds a button via createGivingButton, opens a popup with same-tab fallback)", () => {
    expect(SOURCE).toContain('data-wgc-mode") === "button"');
    expect(SOURCE).toContain("createGivingButton({");
    expect(SOURCE).toContain("window.location.href = url");
  });

  it("escapes untrusted config values before interpolating them into HTML", () => {
    expect(SOURCE).toContain("function escapeHtml(value)");
    expect(SOURCE).toContain("escapeHtml(cfg.organization.name)");
    expect(SOURCE).toContain("escapeHtml(cfg.givingPage.title)");
  });
});
