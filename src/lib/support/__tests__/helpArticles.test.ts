import { describe, it, expect } from "vitest";
import { HELP_ARTICLES, HELP_CATEGORIES, getArticlesByCategory } from "@/lib/support/helpArticles";

describe("help articles", () => {
  it("has a unique slug for every article", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("puts every article in a known category", () => {
    for (const a of HELP_ARTICLES) expect(HELP_CATEGORIES).toContain(a.category);
  });

  it("gives every article a title and a body", () => {
    for (const a of HELP_ARTICLES) {
      expect(a.title.trim().length).toBeGreaterThan(5);
      expect(a.bodyHtml.trim().length).toBeGreaterThan(40);
    }
  });

  it("never leaves an unfilled template marker in an article", () => {
    for (const a of HELP_ARTICLES) expect(a.bodyHtml).not.toMatch(/\[\[|\]\]|undefined/);
  });

  it("lists each article under its own category", () => {
    const grouped = getArticlesByCategory();
    for (const a of HELP_ARTICLES) expect(grouped[a.category].map((x) => x.slug)).toContain(a.slug);
  });

  it("covers the questions people ask about the newer features", () => {
    const slugs = HELP_ARTICLES.map((a) => a.slug);
    expect(slugs).toEqual(expect.arrayContaining(["taking-a-payment-by-phone", "printing-viewing-emailing-a-receipt", "receipt-processing-fee-line", "insights-charged-vs-received", "payout-schedule-and-weekly-payouts", "deposit-included-payments", "searching-payments", "attaching-supporting-documents", "term-field-on-take-a-payment", "note-on-receipts", "what-is-payment-mode", "branded-dashboard"]));
  });

  it("answers each question in a heading followed by its answer", () => {
    const written = HELP_ARTICLES.filter((a) => ["taking-a-payment-by-phone", "printing-viewing-emailing-a-receipt", "receipt-processing-fee-line", "insights-charged-vs-received", "payout-schedule-and-weekly-payouts", "deposit-included-payments", "searching-payments", "attaching-supporting-documents", "term-field-on-take-a-payment", "note-on-receipts", "what-is-payment-mode", "branded-dashboard"].includes(a.slug));
    for (const a of written) {
      const questions = (a.bodyHtml.match(/<h3>/g) ?? []).length;
      const answers = (a.bodyHtml.match(/<\/h3><p>/g) ?? []).length;
      expect(questions).toBeGreaterThan(0);
      expect(answers).toBe(questions);
    }
  });
});
