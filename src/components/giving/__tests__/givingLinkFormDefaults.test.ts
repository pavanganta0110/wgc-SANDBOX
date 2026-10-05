import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import GivingLinkForm from "../GivingLinkForm";
import { DEFAULT_BRANDING_SETTINGS, DEFAULT_DONOR_FIELD_SETTINGS } from "@/lib/givingLinks/types";

/**
 * Renders the real public GivingLinkForm on the server and inspects the
 * markup it opens with (state initializers run during SSR; effects and
 * donor interaction don't). Proves the organization's configured default
 * type/amount is what the donor first sees, and that every existing form
 * (no settings) still opens exactly as it did before.
 */

const SELECTED = "#0a1b2c"; // unique marker: only the selected toggle/amount gets the brand button color as background

const light = { ...DEFAULT_BRANDING_SETTINGS.light, buttonBackground: SELECTED, buttonText: "#ffffff" };

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    createElement(GivingLinkForm as never, {
      slug: "preview",
      finixMerchantId: "",
      churchName: "Grace Church",
      light,
      amountType: "VARIABLE",
      fixedAmountCents: null,
      minAmountCents: null,
      maxAmountCents: null,
      suggestedAmountsCents: [2500, 5000, 10000],
      allowCustomAmount: true,
      recurringEnabled: true,
      allowedFrequencies: ["MONTHLY", "WEEKLY"],
      allowedPaymentMethods: ["CARD"],
      feeCoverEnabled: true,
      feeCoverDefaultOn: true,
      donorFieldSettings: DEFAULT_DONOR_FIELD_SETTINGS,
      pricing: { cardPercentageFee: 2.9, cardFixedFeeCents: 30, achFixedFeeCents: 5 },
      thankYouMessage: "Thanks!",
      googlePayGatewayMerchantId: null,
      googlePayMerchantId: null,
      googlePayEnvironment: "TEST",
      previewMode: true,
      ...overrides,
    } as never)
  );
}

/** The <button ...>label</button> element for a given label, so its inline style can be inspected. */
function buttonFor(html: string, label: RegExp): string {
  const match = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]).find((b) => label.test(b.replace(/<[^>]+>/g, "").trim()));
  if (!match) throw new Error(`No button matching ${label} in rendered form`);
  return match;
}
const isSelected = (button: string) => button.includes(SELECTED);

describe("GivingLinkForm — what the donor first sees", () => {
  it("an existing form (no default settings) opens One-Time, first amount selected, no Frequency picker", () => {
    const html = render();
    expect(isSelected(buttonFor(html, /^One-Time$/))).toBe(true);
    expect(isSelected(buttonFor(html, /^Recurring$/))).toBe(false);
    expect(html).not.toContain(">Frequency<");
    expect(isSelected(buttonFor(html, /^\$25(\.00)?$/))).toBe(true);
    expect(isSelected(buttonFor(html, /^\$50(\.00)?$/))).toBe(false);
  });

  it("Recurring + $50: opens on Recurring with $50 selected, One-Time still offered", () => {
    const html = render({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 });
    expect(isSelected(buttonFor(html, /^Recurring$/))).toBe(true);
    expect(isSelected(buttonFor(html, /^One-Time$/))).toBe(false);
    expect(html).toContain(">Frequency<");
    expect(isSelected(buttonFor(html, /^\$50(\.00)?$/))).toBe(true);
    expect(isSelected(buttonFor(html, /^\$25(\.00)?$/))).toBe(false);
    // Every other amount, and the custom field, are still there to change to.
    expect(html).toMatch(/\$100/);
    expect(html).toContain('placeholder="Custom amount"');
  });

  it("a default amount that isn't one of the suggested amounts is entered in the custom field", () => {
    const html = render({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: 7500 });
    expect(isSelected(buttonFor(html, /^Recurring$/))).toBe(true);
    expect(html).toMatch(/placeholder="Custom amount"[^>]*value="75"|value="75"[^>]*placeholder="Custom amount"/);
  });

  it("Recurring default without a default amount opens Recurring on the normal starting amount", () => {
    const html = render({ defaultDonationType: "RECURRING", defaultRecurringAmountCents: null });
    expect(isSelected(buttonFor(html, /^Recurring$/))).toBe(true);
    expect(isSelected(buttonFor(html, /^\$25(\.00)?$/))).toBe(true);
  });

  it("stays One-Time when recurring giving is off, whatever the stored default says", () => {
    const html = render({ recurringEnabled: false, defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 });
    expect(html).not.toMatch(/>\s*Recurring\s*</); // no toggle at all
    expect(html).not.toContain(">Frequency<");
    expect(isSelected(buttonFor(html, /^\$25(\.00)?$/))).toBe(true);
  });

  it("keeps a fixed price fixed even when Recurring is the default", () => {
    const html = render({ amountType: "FIXED", fixedAmountCents: 10000, defaultDonationType: "RECURRING", defaultRecurringAmountCents: 5000 });
    expect(isSelected(buttonFor(html, /^Recurring$/))).toBe(true);
    expect(html).toContain("$100.00");
    expect(html).not.toContain('placeholder="Custom amount"');
  });
});

describe("GivingLinkForm — mailing address requirement", () => {
  it("defaults (collectMailingAddress on, street not required) show the collapsed optional section", () => {
    const html = render({ collectMailingAddress: true });
    expect(html).toContain("Add mailing address (optional)");
    expect(html).not.toContain("Mailing Address <!-- -->*");
  });

  it("collectMailingAddress off shows no address section at all, even if street is REQUIRED", () => {
    const html = render({
      collectMailingAddress: false,
      donorFieldSettings: { ...DEFAULT_DONOR_FIELD_SETTINGS, street: "REQUIRED" },
    });
    expect(html).not.toContain("Add mailing address");
    expect(html).not.toContain("Mailing Address");
  });

  it("street REQUIRED renders the address block open (not collapsible) with required fields and no save checkbox", () => {
    const html = render({
      collectMailingAddress: true,
      donorFieldSettings: { ...DEFAULT_DONOR_FIELD_SETTINGS, street: "REQUIRED" },
    });
    // No toggle button — a required section can't be collapsed away.
    expect(html).not.toContain("Add mailing address (optional)");
    expect(html).toContain("Mailing Address");
    // Street/City/State/Postal inputs are actually marked required server-
    // side-rendered, not just cosmetically asterisked.
    expect(html).toMatch(/required="" aria-required="true" placeholder="Address line 1 \*"/);
    expect(html).toMatch(/required="" aria-required="true" placeholder="City \*"/);
    expect(html).toMatch(/<select required="" aria-required="true"[^>]*><option value="" selected="">State \*/);
    expect(html).toMatch(/required="" aria-required="true" placeholder="ZIP code \*"/);
    // The explicit opt-in checkbox only makes sense for the optional case —
    // once it's mandatory for the gift, there's nothing left to opt into.
    expect(html).not.toContain("Save this as my mailing address");
  });
});
