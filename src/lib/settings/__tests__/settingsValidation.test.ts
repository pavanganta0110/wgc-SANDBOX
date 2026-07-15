import { describe, it, expect } from "vitest";
import { isValidHttpsUrl, normalizeWhitespace, buildPartialUpdate } from "@/lib/settings/settingsValidation";

describe("isValidHttpsUrl", () => {
  it("accepts a valid https URL", () => {
    expect(isValidHttpsUrl("https://example.org/terms")).toBe(true);
  });

  it("rejects javascript: URLs", () => {
    expect(isValidHttpsUrl("javascript:alert(1)")).toBe(false);
  });

  it("rejects null/empty", () => {
    expect(isValidHttpsUrl(null)).toBe(false);
    expect(isValidHttpsUrl("")).toBe(false);
  });

  it("rejects a malformed URL", () => {
    expect(isValidHttpsUrl("not a url")).toBe(false);
  });
});

describe("normalizeWhitespace", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeWhitespace("  hello   world  ")).toBe("hello world");
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(normalizeWhitespace("   ")).toBeNull();
    expect(normalizeWhitespace("")).toBeNull();
  });

  it("returns null for null/undefined", () => {
    expect(normalizeWhitespace(null)).toBeNull();
    expect(normalizeWhitespace(undefined)).toBeNull();
  });
});

describe("buildPartialUpdate", () => {
  it("only includes fields explicitly present in the body", () => {
    const update = buildPartialUpdate({ name: "New Name" }, ["name", "phone", "website"]);
    expect(update).toEqual({ name: "New Name" });
    expect("phone" in update).toBe(false);
  });

  it("never nulls out a field that's simply absent from the body", () => {
    const update = buildPartialUpdate({ name: "New Name" }, ["name", "phone"]);
    expect("phone" in update).toBe(false);
  });

  it("clears a field only when the body explicitly sends an empty string for it", () => {
    const update = buildPartialUpdate({ phone: "" }, ["name", "phone"]);
    expect(update.phone).toBeNull();
  });

  it("passes through booleans and numbers unchanged", () => {
    const update = buildPartialUpdate({ enabled: true, count: 5 }, ["enabled", "count"]);
    expect(update).toEqual({ enabled: true, count: 5 });
  });
});
