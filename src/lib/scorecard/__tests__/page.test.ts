import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { normalizeSlug, scorecardConfig } from "../config";
import { cleanPhone } from "../service";

const html = readFileSync(path.join(process.cwd(), "public/scorecard/index.html"), "utf8");

// The page's own scoring functions, pulled out of the page and run here.
const between = (from: string, to: string) => html.slice(html.indexOf(from), html.indexOf(to));
const page = new Function(`${between("const AREAS=[", "const SITE=")}\n${between("function ruleScore", "function rulePitch")}\nreturn { AREAS, ruleScore };`)() as {
  AREAS: Array<{ key: string }>;
  ruleScore: (a: unknown, t: string) => { score: number };
};

describe("the page's fallback scoring (used only when the AI can't be reached)", () => {
  it("never scores a thin or 'we have little' answer well", () => {
    for (const a of page.AREAS) {
      expect(page.ruleScore(a, "Honestly not much").score).toBeLessThanOrEqual(2);
      expect(page.ruleScore(a, "We don't really do anything about this and have never asked the board or any donor for a gift").score).toBeLessThanOrEqual(2);
      expect(page.ruleScore(a, "").score).toBe(1);
    }
  });

  it("can still score a rich answer higher than a thin one", () => {
    const rich = "We track every donor in a CRM, call each top donor every quarter with no ask, send impact reports twice a year, thank every gift personally within 48 hours, and review retention each month with our board.";
    const relationships = page.AREAS.find((a) => a.key === "relationships")!;
    expect(page.ruleScore(relationships, rich).score).toBeGreaterThan(page.ruleScore(relationships, "some").score);
  });
});

describe("the scorecard page", () => {
  it("does not pre-check the data-use box, so people opt in", () => {
    expect(html).toMatch(/<input type="checkbox" id="dataConsent">/);
    expect(html).not.toMatch(/id="dataConsent"[^>]*checked/);
  });

  it("checks the phone number before it scores", () => {
    expect(html).toContain("leadPhone");
    expect(html).toContain("Enter a phone number with digits only");
  });

  it("explains the slider's text as 'why we scored you', and shows the score the person chose", () => {
    expect(html).toContain("Why we scored you ${r.score}:");
    expect(html).toContain("you chose ${v}");
  });

  it("keeps the whole result in the browser and shows it again on a reload, with a way to start over", () => {
    expect(html).toContain("localStorage.setItem('wgcScorecardState'");
    expect(html).toContain("localStorage.getItem('wgcScorecardState')");
    expect(html).toContain("Welcome back.");
    expect(html).toContain('id="startOver"');
    // a follow-up email link has its own flow, so it is left alone
    expect(html).toMatch(/get\('lead'\)\)return;\s*\/\* a follow-up email link/);
  });
});

describe("the scorecard page after Collin's copy changes", () => {
  it("has no beta banner and no feedback box, and the script no longer reaches for them", () => {
    expect(html).not.toMatch(/Beta version/i);
    expect(html).not.toContain("Help us improve the beta");
    expect(html).not.toContain('id="feedback"');
    expect(html).not.toContain("fbSend");
    expect(html).not.toContain("$('feedback')");
  });

  it("every element the script looks up by a fixed id exists in the page, so removing a box can't break the whole script", () => {
    const wanted = new Set([...html.matchAll(/\$\('([A-Za-z0-9_]+)'\)/g)].map((m) => m[1]));
    expect(wanted.size).toBeGreaterThan(10);
    for (const id of wanted) expect(html, `missing element #${id}`).toMatch(new RegExp(`id=\\\\?"${id}"`));
  });

  it("the free results name the areas to work on and send the detail to the paid report, with no pitch review", () => {
    expect(html).toContain("To get the details on each of these, get the full report below.");
    expect(html).not.toContain("Pitch review");
    expect(html).not.toContain("pitchHtml");
    expect(html).not.toMatch(/\$\{esc\(current\.auto\.areas\[a\.key\]\.fix\)\}/);
  });

  it("the Ongoing partnership box links to Collin's Calendly", () => {
    expect(html).toContain('href="https://calendly.com/waypoint-gateway-collective/wgc-free-strategy-call"');
    expect(html).toContain("Click to hear more");
  });
});

describe("normalizeSlug", () => {
  it("takes a plain slug as it is", () => {
    expect(normalizeSlug("IPHa4RsF8WlK")).toBe("IPHa4RsF8WlK");
    expect(normalizeSlug("  abc_DEF-12  ")).toBe("abc_DEF-12");
  });

  it("finds the slug when the whole giving link, or the embed address, was pasted instead", () => {
    expect(normalizeSlug("https://www.wgcpaymentssandbox.com/g/AbCdEf123456")).toBe("AbCdEf123456");
    expect(normalizeSlug("https://fund.wgcpaymentssandbox.com/embed/AbCdEf123456?x=1")).toBe("AbCdEf123456");
    expect(normalizeSlug("www.wgcpaymentssandbox.com/g/AbCdEf123456/")).toBe("AbCdEf123456");
  });

  it("gives nothing for junk, so the default is used", () => {
    expect(normalizeSlug("")).toBe("");
    expect(normalizeSlug(undefined)).toBe("");
    expect(normalizeSlug("https://example.com/")).toBe("");
    expect(normalizeSlug("a b")).toBe("");
  });

  it("is what the settings use, so a pasted link still opens the right giving link", () => {
    process.env.SCORECARD_GIVING_LINK_SLUG = "https://www.wgcpaymentssandbox.com/g/AbCdEf123456";
    expect(scorecardConfig().givingLinkSlug).toBe("AbCdEf123456");
    process.env.SCORECARD_GIVING_LINK_SLUG = "https://nonsense";
    expect(scorecardConfig().givingLinkSlug).toBe("IPHa4RsF8WlK");
    delete process.env.SCORECARD_GIVING_LINK_SLUG;
  });
});

describe("cleanPhone", () => {
  it("keeps real numbers and drops letters and short junk", () => {
    expect(cleanPhone("816-555-0123")).toBe("816-555-0123");
    expect(cleanPhone("+1 (816) 555 0123")).toBe("+1 (816) 555 0123");
    expect(cleanPhone("abc123")).toBe("");
    expect(cleanPhone("12345")).toBe("");
    expect(cleanPhone(undefined)).toBe("");
  });
});
