import { describe, it, expect } from "vitest";
import {
  DEFAULT_RECEIPT_DISCLAIMER,
  DEFAULT_RECEIPT_SUBJECT_TEMPLATE,
  DEFAULT_RECEIPT_THANK_YOU_MESSAGE,
  resolveReceiptSettings,
} from "@/lib/settings/receiptDefaults";
import { DEFAULT_NO_GOODS_SERVICES_TEXT, resolveAcknowledgmentText } from "@/lib/settings/acknowledgmentDefaults";
import { PAYMENT_MODE_RECEIPT_TEXT } from "@/lib/settings/paymentMode";
import { donorPortalLinkParagraph } from "@/lib/donorPortal/portalLink";

describe("receipt defaults", () => {
  it("keep the donation wording for an org without payment mode", () => {
    for (const church of [null, {}, { paymentMode: false }]) {
      const s = resolveReceiptSettings(church);
      expect(s.subjectTemplate).toBe(DEFAULT_RECEIPT_SUBJECT_TEMPLATE);
      expect(s.thankYouMessage).toBe(DEFAULT_RECEIPT_THANK_YOU_MESSAGE);
      expect(s.disclaimer).toBe(DEFAULT_RECEIPT_DISCLAIMER);
    }
  });

  it("switch to payment wording in payment mode", () => {
    const s = resolveReceiptSettings({ paymentMode: true });
    expect(s.subjectTemplate).toBe(PAYMENT_MODE_RECEIPT_TEXT.subject);
    expect(s.thankYouMessage).toBe(PAYMENT_MODE_RECEIPT_TEXT.thankYou);
    expect(s.disclaimer).toBe(PAYMENT_MODE_RECEIPT_TEXT.disclaimer);
    expect(`${s.subjectTemplate}${s.thankYouMessage}${s.disclaimer}`.toLowerCase()).not.toMatch(/gift|donat|generos/);
  });

  it("never override text the organization saved itself", () => {
    const s = resolveReceiptSettings({
      paymentMode: true,
      receiptSubjectTemplate: "Your MBTS receipt",
      receiptThankYouMessage: "Thanks from MBTS",
      receiptDisclaimer: "Custom disclaimer",
    });
    expect(s.subjectTemplate).toBe("Your MBTS receipt");
    expect(s.thankYouMessage).toBe("Thanks from MBTS");
    expect(s.disclaimer).toBe("Custom disclaimer");
  });
});

describe("acknowledgment text", () => {
  it("keeps the IRS-style sentence by default", () => {
    expect(resolveAcknowledgmentText({}, null, null)).toBe(DEFAULT_NO_GOODS_SERVICES_TEXT);
  });

  it("drops the contribution sentence in payment mode", () => {
    const text = resolveAcknowledgmentText({ paymentMode: true }, null, null);
    expect(text).toBe(PAYMENT_MODE_RECEIPT_TEXT.noGoodsServices);
    expect(text.toLowerCase()).not.toContain("contribution");
  });

  it("uses payment wording for a goods/services disclosure in payment mode", () => {
    const text = resolveAcknowledgmentText({ paymentMode: true }, "A tote bag", 1000);
    expect(text).toContain("A tote bag");
    expect(text).toContain("$10.00");
    expect(text).toContain("exchange for this payment");
  });

  it("still honors the organization's own saved acknowledgment in payment mode", () => {
    expect(resolveAcknowledgmentText({ paymentMode: true, acknowledgmentNoGoodsServicesText: "Our text" }, null, null)).toBe("Our text");
  });
});

describe("donorPortalLinkParagraph", () => {
  it("links to the same page with payment wording in payment mode", () => {
    const normal = donorPortalLinkParagraph("mbts");
    const payment = donorPortalLinkParagraph("mbts", true);
    expect(normal).toContain("View my giving");
    expect(payment).toContain("View my payments");
    expect(payment).not.toContain("giving");
    expect(payment).toContain("/give/mbts/account");
    expect(donorPortalLinkParagraph(null, true)).toBe("");
  });
});
