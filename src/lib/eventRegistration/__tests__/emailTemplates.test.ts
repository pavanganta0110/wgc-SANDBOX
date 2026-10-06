import { describe, it, expect } from "vitest";
import {
  DEFAULT_EVENT_EMAIL_TEMPLATES,
  parseEmailTemplates,
  validateEmailTemplates,
  renderEventTemplate,
  bodyToHtml,
  sanitizeEmailHtml,
  type EventEmailContext,
} from "@/lib/eventRegistration/emailTemplates";

const ctx: EventEmailContext = {
  eventName: "Spring Gala",
  eventDate: "Saturday, May 2, 2026",
  eventTime: "6:00 PM",
  eventLocation: "Main Hall",
  eventLink: "https://www.wgcpayments.com/event/spring",
  organizationName: "Hope Academy",
  registrantName: "Pat Lee",
  registrantFirstName: "Pat",
  recipientFirstName: "Pat",
  groupName: "Team Rocket",
  attendeeCount: "2",
  confirmationCode: "ABCD2345",
};

describe("renderEventTemplate", () => {
  it("fills known merge fields, tolerating inner spaces", () => {
    expect(renderEventTemplate("Hi {{recipientFirstName}} — {{ eventName }} on {{eventDate}}", ctx, { html: false })).toBe("Hi Pat — Spring Gala on Saturday, May 2, 2026");
  });

  it("leaves unknown tokens visible so a typo is noticed", () => {
    expect(renderEventTemplate("Hello {{firstNme}}", ctx, { html: false })).toBe("Hello {{firstNme}}");
  });

  it("escapes values in HTML mode so a registrant name cannot inject markup", () => {
    const out = renderEventTemplate("{{registrantName}}", { ...ctx, registrantName: "<script>alert(1)</script>" }, { html: true });
    expect(out).not.toContain("<script>");
  });

  it("keeps generic wording — no organization-type assumptions in the defaults", () => {
    const all = JSON.stringify(DEFAULT_EVENT_EMAIL_TEMPLATES).toLowerCase();
    for (const word of ["gala", "golf", "academy", "church", "school"]) expect(all).not.toContain(word);
  });
});

describe("bodyToHtml", () => {
  it("turns plain text into paragraphs", () => {
    const html = bodyToHtml("Line one\n\nLine two", ctx);
    expect(html.match(/<p /g)).toHaveLength(2);
  });

  it("strips scripts and event handlers from merchant-written HTML", () => {
    const html = bodyToHtml('<p onclick="x()">Hi</p><script>bad()</script><a href="javascript:evil()">go</a>', ctx);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toMatch(/javascript:/i);
  });
});

describe("sanitizeEmailHtml", () => {
  it("removes iframes and styles", () => {
    expect(sanitizeEmailHtml('<iframe src="x"></iframe><style>a{}</style><b>ok</b>')).toBe("<b>ok</b>");
  });
});

describe("template storage", () => {
  it("falls back to defaults for missing or malformed data", () => {
    expect(parseEmailTemplates(null)).toEqual(DEFAULT_EVENT_EMAIL_TEMPLATES);
    expect(parseEmailTemplates("junk").reminder.daysBefore).toBe(7);
  });

  it("keeps merchant edits and leaves reminders off by default", () => {
    const t = parseEmailTemplates({ reminder: { enabled: true, daysBefore: 3, subject: "Soon!", body: "See you" } });
    expect(t.reminder).toMatchObject({ enabled: true, daysBefore: 3, subject: "Soon!" });
    expect(parseEmailTemplates({}).reminder.enabled).toBe(false);
  });

  it("rejects out-of-range reminder days and blank messages on save", () => {
    expect(validateEmailTemplates({ reminder: { daysBefore: 99 } }).ok).toBe(false);
    expect(validateEmailTemplates({ confirmation: { subject: "  ", body: "x" } }).ok).toBe(true); // blank falls back to the default
    expect(validateEmailTemplates({ reminder: { daysBefore: 5 } }).ok).toBe(true);
  });
});

describe("photos in event emails", () => {
  it("turns [photo: https://…] into an image, keeping the rest of the message", () => {
    const html = bodyToHtml("Thanks for coming!\n\n[photo: https://cdn.example.com/a.jpg]\n\nSee you next year.", ctx);
    expect(html).toContain('<img src="https://cdn.example.com/a.jpg"');
    expect(html).toContain("Thanks for coming!");
    expect(html).toContain("See you next year.");
  });

  it("works in HTML messages too", () => {
    expect(bodyToHtml("<p>Photos:</p>[photo: https://cdn.example.com/b.png]", ctx)).toContain('<img src="https://cdn.example.com/b.png"');
  });

  it("only accepts https links and never lets a link break out of the attribute", () => {
    expect(bodyToHtml("[photo: http://insecure.example/a.jpg]", ctx)).not.toContain("<img");
    expect(bodyToHtml("[photo: javascript:alert(1)]", ctx)).not.toContain("<img");
    const evil = bodyToHtml('[photo: https://x.example/a.jpg" onerror="alert(1)]', ctx);
    expect(evil).not.toContain("<img");
    expect(evil).not.toMatch(/<[^>]*onerror=/); // stays inert, escaped text — never inside a tag
  });
});

describe("videos in event emails", () => {
  it("turns [video: https://…] into a Watch button linking to the page", () => {
    const html = bodyToHtml("See the recap:\n\n[video: https://youtu.be/abc123]", ctx);
    expect(html).toContain('<a href="https://youtu.be/abc123"');
    expect(html).toContain("Watch the video");
    expect(html).not.toContain("<video");
  });

  it("only accepts https links and never lets a link break out of the attribute", () => {
    expect(bodyToHtml("[video: http://insecure.example/v]", ctx)).not.toContain("Watch the video");
    expect(bodyToHtml("[video: javascript:alert(1)]", ctx)).not.toContain("Watch the video");
    const evil = bodyToHtml('[video: https://x.example/v" onclick="alert(1)]', ctx);
    expect(evil).not.toContain("Watch the video");
    expect(evil).not.toMatch(/<[^>]*onclick=/);
  });
});
