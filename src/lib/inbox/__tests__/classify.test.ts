import { describe, expect, it } from "vitest";
import { classifyEmail, normalizeEmail, senderMatchesPattern, guessCategory } from "../classify";

const base = { fromEmail: "x@example.com", subject: "Hello", body: "", rules: [], senderIsKnownUser: false };

describe("classifyEmail", () => {
  it("allow rule wins over spam phrases", () => {
    const r = classifyEmail({ ...base, subject: "crypto donation", rules: [{ kind: "ALLOW", pattern: "@example.com" }] });
    expect(r.classification).toBe("SUPPORT");
  });
  it("known user is support even with a bulk-looking address", () => {
    expect(classifyEmail({ ...base, fromEmail: "noreply@church.org", senderIsKnownUser: true }).classification).toBe("SUPPORT");
  });
  it("ticket number in subject marks a reply", () => {
    const r = classifyEmail({ ...base, subject: "Re: [WGC-1042] payout" });
    expect(r.classification).toBe("SUPPORT");
    expect(r.ticketNumber).toBe("WGC-1042");
  });
  it("block rule and spam phrases go to spam", () => {
    expect(classifyEmail({ ...base, rules: [{ kind: "BLOCK", pattern: "x@example.com" }] }).classification).toBe("SPAM");
    expect(classifyEmail({ ...base, subject: "Guaranteed ranking on Google" }).classification).toBe("SPAM");
  });
  it("auto replies and bulk senders go to bulk", () => {
    expect(classifyEmail({ ...base, fromEmail: "no-reply@x.com" }).classification).toBe("BULK");
    expect(classifyEmail({ ...base, subject: "Out of office until Monday" }).classification).toBe("BULK");
    expect(classifyEmail({ ...base, body: "click to unsubscribe" }).classification).toBe("BULK");
  });
  it("support keywords make support, otherwise needs review", () => {
    expect(classifyEmail({ ...base, subject: "Refund for a gift" }).classification).toBe("SUPPORT");
    expect(classifyEmail({ ...base, subject: "Hi there" }).classification).toBe("NEEDS_REVIEW");
  });
});

describe("helpers", () => {
  it("normalizes display-name addresses", () => expect(normalizeEmail('Kerry <Kerry@X.org>')).toBe("kerry@x.org"));
  it("matches domain and exact patterns", () => {
    expect(senderMatchesPattern("a@b.com", "@b.com")).toBe(true);
    expect(senderMatchesPattern("a@b.com", "a@b.com")).toBe(true);
    expect(senderMatchesPattern("a@c.com", "@b.com")).toBe(false);
  });
  it("guesses a category", () => expect(guessCategory("my payout is late")).toBe("SETTLEMENT"));
});
