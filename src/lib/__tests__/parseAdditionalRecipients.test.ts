import { describe, it, expect } from "vitest";
import { parseAdditionalRecipients } from "@/lib/email";

describe("parseAdditionalRecipients", () => {
  it("parses a comma-separated string, trimming whitespace", () => {
    expect(parseAdditionalRecipients("a@example.com, b@example.com")).toEqual(["a@example.com", "b@example.com"]);
  });

  it("also accepts semicolons and newlines as separators", () => {
    expect(parseAdditionalRecipients("a@example.com; b@example.com\nc@example.com")).toEqual([
      "a@example.com",
      "b@example.com",
      "c@example.com",
    ]);
  });

  it("lowercases addresses", () => {
    expect(parseAdditionalRecipients("Someone@Example.COM")).toEqual(["someone@example.com"]);
  });

  it("drops anything that isn't a plausible email address, without throwing", () => {
    expect(parseAdditionalRecipients("not-an-email, also not one, real@example.com")).toEqual(["real@example.com"]);
  });

  it("de-dupes", () => {
    expect(parseAdditionalRecipients("a@example.com, a@example.com")).toEqual(["a@example.com"]);
  });

  it("caps the count so a resend can never fan out to an unbounded list", () => {
    const many = Array.from({ length: 20 }, (_, i) => `person${i}@example.com`).join(",");
    expect(parseAdditionalRecipients(many)).toHaveLength(5);
  });

  it("accepts an already-split array", () => {
    expect(parseAdditionalRecipients(["a@example.com", "b@example.com"])).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns an empty array for undefined/null/empty input, never throwing", () => {
    expect(parseAdditionalRecipients(undefined)).toEqual([]);
    expect(parseAdditionalRecipients(null)).toEqual([]);
    expect(parseAdditionalRecipients("")).toEqual([]);
    expect(parseAdditionalRecipients(42)).toEqual([]);
  });
});
