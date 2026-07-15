import { describe, it, expect } from "vitest";
import {
  DEFAULT_THANK_YOU_MESSAGE,
  STATEMENT_DISCLAIMER,
  resolveStatementPdfSettings,
} from "@/lib/donors/generateStatementDefaults";

describe("resolveStatementPdfSettings", () => {
  it("falls back to built-in defaults when the organization has no custom Statement Settings", () => {
    const settings = resolveStatementPdfSettings(null);
    expect(settings.thankYouMessage).toBe(DEFAULT_THANK_YOU_MESSAGE);
    expect(settings.disclaimer).toBe(STATEMENT_DISCLAIMER);
    expect(settings.organizationTaxId).toBeNull();
    expect(settings.showDonorCoveredFees).toBe(false);
  });

  it("uses the organization's custom text when set", () => {
    const settings = resolveStatementPdfSettings({
      statementThankYouMessage: "Custom thank you",
      statementDisclaimer: "Custom disclaimer",
      statementShowTaxId: false,
      statementShowDonorCoveredFees: true,
      taxId: "12-3456789",
    });
    expect(settings.thankYouMessage).toBe("Custom thank you");
    expect(settings.disclaimer).toBe("Custom disclaimer");
    expect(settings.showDonorCoveredFees).toBe(true);
  });

  it("only surfaces the organization's tax ID when statementShowTaxId is explicitly enabled", () => {
    const shown = resolveStatementPdfSettings({ statementShowTaxId: true, taxId: "12-3456789" });
    expect(shown.organizationTaxId).toBe("12-3456789");

    const hidden = resolveStatementPdfSettings({ statementShowTaxId: false, taxId: "12-3456789" });
    expect(hidden.organizationTaxId).toBeNull();
  });

  it("does not leak a tax ID when show is enabled but no tax ID is on file", () => {
    const settings = resolveStatementPdfSettings({ statementShowTaxId: true, taxId: null });
    expect(settings.organizationTaxId).toBeNull();
  });
});
