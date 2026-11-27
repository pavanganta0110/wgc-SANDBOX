import { describe, it, expect, beforeEach } from "vitest";
import { oneLine, scorecardSecret, sign, verifySignature } from "../config";

beforeEach(() => {
  delete process.env.SCORECARD_SECRET;
});

describe("the signing secret", () => {
  it("is off when missing, the old placeholder, or too short, so no link can be forged with a known value", () => {
    expect(scorecardSecret()).toBeNull();
    process.env.SCORECARD_SECRET = "change-me";
    expect(scorecardSecret()).toBeNull();
    process.env.SCORECARD_SECRET = "short";
    expect(scorecardSecret()).toBeNull();
    expect(sign("abc")).toBeNull();
    expect(verifySignature("abc", "anything")).toBe(false);
  });

  it("signs a value and checks the signature, and refuses another value, another token or a non-string", () => {
    process.env.SCORECARD_SECRET = "k".repeat(32);
    const t = sign("contact1")!;
    expect(t).toHaveLength(22);
    expect(verifySignature("contact1", t)).toBe(true);
    expect(verifySignature("contact2", t)).toBe(false);
    expect(verifySignature("contact1", t.slice(0, -1) + (t.endsWith("a") ? "b" : "a"))).toBe(false);
    expect(verifySignature("contact1", undefined)).toBe(false);
    expect(verifySignature("contact1", 123)).toBe(false);
  });
});

describe("oneLine", () => {
  it("removes line breaks so text from a visitor can't break an email header", () => {
    expect(oneLine("Grace\r\nBcc: evil@x.co")).toBe("Grace Bcc: evil@x.co");
    expect(oneLine("a".repeat(500), 10)).toHaveLength(10);
  });
});
