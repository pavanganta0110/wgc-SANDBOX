import { describe, it, expect } from "vitest";
import { isValidCategory, isValidPriority, categoryLabel, TICKET_CATEGORIES } from "@/lib/support/ticketCategories";

describe("isValidCategory", () => {
  it("accepts every defined category value", () => {
    for (const c of TICKET_CATEGORIES) {
      expect(isValidCategory(c.value)).toBe(true);
    }
  });

  it("rejects unknown or non-string values", () => {
    expect(isValidCategory("NOT_A_CATEGORY")).toBe(false);
    expect(isValidCategory(null)).toBe(false);
    expect(isValidCategory(undefined)).toBe(false);
    expect(isValidCategory(123)).toBe(false);
  });
});

describe("isValidPriority", () => {
  it("accepts LOW/NORMAL/HIGH/URGENT", () => {
    expect(isValidPriority("LOW")).toBe(true);
    expect(isValidPriority("NORMAL")).toBe(true);
    expect(isValidPriority("HIGH")).toBe(true);
    expect(isValidPriority("URGENT")).toBe(true);
  });

  it("rejects an invalid priority", () => {
    expect(isValidPriority("CRITICAL")).toBe(false);
    expect(isValidPriority(null)).toBe(false);
  });
});

describe("categoryLabel", () => {
  it("returns the human label for a known category", () => {
    expect(categoryLabel("PAYMENT")).toBe("Payment");
  });

  it("falls back to the raw value for an unknown category", () => {
    expect(categoryLabel("SOMETHING_ELSE")).toBe("SOMETHING_ELSE");
  });
});
