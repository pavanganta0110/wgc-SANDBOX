import { describe, it, expect } from "vitest";
import { HELP_ARTICLES } from "@/lib/support/helpArticles";
import { extractEntries, htmlToText, redactQuery, searchHelp, stem, tokenize } from "@/lib/support/helpSearch";

const present = new Set(HELP_ARTICLES.map((a) => a.slug));

// [what someone might type, the article that should come first]
const TOP_1: [string, string][] = [
  ["how do I print a receipt", "printing-viewing-emailing-a-receipt"],
  ["can I print a receipt if the payer has no email", "printing-viewing-emailing-a-receipt"],
  ["the print button downloaded a file instead of printing", "printing-viewing-emailing-a-receipt"],
  ["why doesn't my receipt show the processing fee", "receipt-processing-fee-line"],
  ["receipt does not list the fee the payer covered", "receipt-processing-fee-line"],
  ["why is total transaction volume higher than what we receive", "insights-charged-vs-received"],
  ["what is amount to organization on insights", "insights-charged-vs-received"],
  ["can payouts be weekly instead of daily", "payout-schedule-and-weekly-payouts"],
  ["when do I get paid", "payout-schedule-and-weekly-payouts"],
  ["how long do ACH payments take to reach the bank", "payout-schedule-and-weekly-payouts"],
  ["how do I take a payment over the phone", "taking-a-payment-by-phone"],
  ["how do I see which payments are in a deposit", "deposit-included-payments"],
  ["download a deposit csv to match my bank statement", "deposit-included-payments"],
  ["search for a payment by student id", "searching-payments"],
  ["find a payment by amount", "searching-payments"],
  ["how do I attach a document to a payment", "attaching-supporting-documents"],
  ["upload an invoice as proof for an audit", "attaching-supporting-documents"],
  ["what is the term field", "term-field-on-take-a-payment"],
  ["tag a payment with a prior semester", "term-field-on-take-a-payment"],
  ["can I show a note on the receipt", "note-on-receipts"],
  ["what is payment mode", "what-is-payment-mode"],
  ["why does my dashboard say payers instead of donors", "what-is-payment-mode"],
  ["why do I see my logo on the dashboard", "branded-dashboard"],
  ["how do I invite a team member", "inviting-a-team-member"],
  ["I forgot my password", "changing-your-password"],
  ["how do I create a giving link", "creating-a-giving-link"],
  ["what are the processing fees", "understanding-fees"],
  ["how do I respond to a dispute", "responding-to-a-dispute"],
];

// Questions that fit more than one article: the right one just has to be among the top three.
const TOP_3: [string, string][] = [
  ["why did my payment fail", "taking-a-payment-by-phone"],
  ["email a receipt to a different address", "printing-viewing-emailing-a-receipt"],
  ["where do I see my deposits", "payout-schedule-and-weekly-payouts"],
  ["export payments to csv with my search", "searching-payments"],
];

describe("searchHelp — finds the right answer", () => {
  it.each(TOP_1.filter(([, slug]) => present.has(slug)))("%s -> %s", (query, slug) => {
    const results = searchHelp(query);
    expect(results[0]?.slug).toBe(slug);
  });

  it.each(TOP_3.filter(([, slug]) => present.has(slug)))("%s -> %s (top 3)", (query, slug) => {
    expect(searchHelp(query).map((r) => r.slug)).toContain(slug);
  });
});

describe("searchHelp — behavior", () => {
  it("returns nothing for questions the Help Center does not cover", () => {
    for (const query of ["banana smoothie recipe", "who won the football game", "asdfgh", "   ", "?"]) {
      expect(searchHelp(query)).toEqual([]);
    }
  });

  it("returns at most three articles, one entry per article, best first", () => {
    const results = searchHelp("receipt payment fee");
    expect(results.length).toBeLessThanOrEqual(3);
    expect(new Set(results.map((r) => r.slug)).size).toBe(results.length);
    for (let i = 1; i < results.length; i++) expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
  });

  it("answers with the matching question and its answer text, not markup", () => {
    const [top] = searchHelp("what if the payer has no email address for the receipt");
    expect(top.answer).not.toMatch(/<[a-z]/i);
    expect(top.question.length).toBeGreaterThan(5);
    expect(top.answer.length).toBeGreaterThan(20);
  });

  it("is not thrown off by case, punctuation or word endings", () => {
    const a = searchHelp("PRINTING RECEIPTS!!!")[0]?.slug;
    const b = searchHelp("print a receipt")[0]?.slug;
    expect(a).toBeDefined();
    expect(a).toBe(b);
  });
});

describe("extractEntries", () => {
  it("splits question-and-answer articles into one entry per question", () => {
    const article = {
      slug: "x",
      title: "Title",
      category: "Cat",
      bodyHtml: "<p>Intro</p><h3>First?</h3><p>One &amp; done.</p><h3>Second?</h3><p>Two.</p>",
    };
    expect(extractEntries(article).map((e) => [e.question, e.answer])).toEqual([
      ["First?", "One & done."],
      ["Second?", "Two."],
    ]);
  });

  it("treats a single-paragraph article as one entry titled by the article", () => {
    const entries = extractEntries({ slug: "y", title: "How do I?", category: "Cat", bodyHtml: "<p>Do <strong>this</strong>.</p>" });
    expect(entries).toEqual([{ slug: "y", articleTitle: "How do I?", category: "Cat", question: "How do I?", answer: "Do this." }]);
  });

  it("produces at least one non-empty entry for every article", () => {
    for (const a of HELP_ARTICLES) {
      const entries = extractEntries(a);
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.question.length).toBeGreaterThan(0);
        expect(e.answer.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("text helpers", () => {
  it("stems plurals and endings consistently", () => {
    expect(stem("receipts")).toBe(stem("receipt"));
    expect(stem("fees")).toBe(stem("fee"));
    expect(stem("processing")).toBe(stem("processed"));
    expect(stem("payments")).toBe(stem("payment"));
  });

  it("drops filler words", () => {
    expect(tokenize("How do I print the receipt?")).toEqual([stem("print"), stem("receipt")]);
  });

  it("converts basic entities and tags to text", () => {
    expect(htmlToText("<p>A &amp; B &gt; C</p>")).toBe("A & B > C");
  });
});

describe("redactQuery", () => {
  it("masks card-like numbers and email addresses before anything is logged", () => {
    expect(redactQuery("my card 4242 4242 4242 4242 failed")).toBe("my card [number] failed");
    expect(redactQuery("send it to jane@example.com please")).toBe("send it to [email] please");
  });

  it("keeps short numbers such as an amount and caps the length", () => {
    expect(redactQuery("refund $1,030")).toBe("refund $1,030");
    expect(redactQuery("x".repeat(500))).toHaveLength(200);
  });
});
