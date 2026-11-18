import { describe, it, expect } from "vitest";
import { ANNOUNCEMENT_COOLDOWN_MS, announcementWaitMs, audienceStatuses, escapeHtml, fillFields, introHtmlFor, parseEmailSettings, subjectFor } from "../emailSettings";

const vals = { name: "Jane", auction: "Spring Gala", item: "Quilt", amount: "$120", bidderNumber: 101 };

describe("parseEmailSettings", () => {
  it("keeps only known emails and trims; drops empty and unknown entries", () => {
    expect(parseEmailSettings({ outbid: { subject: "  Hey {{name}}  ", intro: " Thanks! " }, winner: { subject: "", intro: "  " }, bogus: { subject: "x" }, declined: "nope" })).toEqual({ outbid: { subject: "Hey {{name}}", intro: "Thanks!" } });
  });
  it("puts a subject on one line and caps lengths", () => {
    const out = parseEmailSettings({ approved: { subject: "a\r\nb", intro: "x".repeat(5000) } });
    expect(out.approved?.subject).toBe("a b");
    expect(out.approved?.intro?.length).toBe(2000);
  });
  it("accepts only a real date for the cooldown clock, and survives junk input", () => {
    expect(parseEmailSettings({ lastAnnouncementAt: "2026-11-18T10:00:00.000Z" }).lastAnnouncementAt).toBe("2026-11-18T10:00:00.000Z");
    expect(parseEmailSettings({ lastAnnouncementAt: "not a date" }).lastAnnouncementAt).toBeUndefined();
    expect(parseEmailSettings(null)).toEqual({});
    expect(parseEmailSettings("x")).toEqual({});
  });
});

describe("fillFields and subjectFor", () => {
  it("fills known fields and drops unknown or empty ones instead of showing code", () => {
    expect(fillFields("Hi {{ name }}, item {{item}} {{nope}} {{amount}}", { name: "Jane", item: "Quilt", amount: null })).toBe("Hi Jane, item Quilt  ");
  });
  it("uses the organization's subject, or the standard one when it has none", () => {
    expect(subjectFor("outbid", { outbid: { subject: "Oh no {{name}}!" } }, vals)).toBe("Oh no Jane!");
    expect(subjectFor("outbid", {}, vals)).toBe("You've been outbid on Quilt");
    expect(subjectFor("winner", {}, vals)).toBe("You won! Pay for your items from Spring Gala");
  });
  it("falls back to the standard subject when the wording fills in to nothing", () => {
    expect(subjectFor("outbid", { outbid: { subject: "{{nope}}" } }, vals)).toBe("You've been outbid on Quilt");
  });
});

describe("introHtmlFor", () => {
  it("is empty when the organization wrote nothing", () => {
    expect(introHtmlFor("winner", {}, vals)).toBe("");
  });
  it("escapes everything the organization types, so it cannot inject markup", () => {
    const html = introHtmlFor("winner", { winner: { intro: '<script>alert(1)</script> <a href="x">hi</a> {{name}}' } }, vals);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<a ");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Jane");
  });
  it("keeps line breaks", () => {
    expect(introHtmlFor("approved", { approved: { intro: "one\ntwo" } }, vals)).toBe("<p>one<br>two</p>");
  });
  it("escapes a bidder's name that holds markup, since names are filled in too", () => {
    expect(introHtmlFor("approved", { approved: { intro: "Hi {{name}}" } }, { ...vals, name: "<b>x</b>" })).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(escapeHtml(`"'&`)).toBe("&quot;&#39;&amp;");
  });
});

describe("announcements", () => {
  it("everyone means approved and waiting, never declined or blocked", () => {
    expect(audienceStatuses("ALL")).toEqual(["APPROVED", "PENDING"]);
    expect(audienceStatuses("APPROVED")).toEqual(["APPROVED"]);
    expect(audienceStatuses("WAITING")).toEqual(["PENDING"]);
  });
  it("blocks a second send for ten minutes", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(announcementWaitMs({}, now)).toBeNull();
    expect(announcementWaitMs({ lastAnnouncementAt: new Date(now.getTime() - 60_000).toISOString() }, now)).toBe(ANNOUNCEMENT_COOLDOWN_MS - 60_000);
    expect(announcementWaitMs({ lastAnnouncementAt: new Date(now.getTime() - ANNOUNCEMENT_COOLDOWN_MS - 1).toISOString() }, now)).toBeNull();
  });
});
