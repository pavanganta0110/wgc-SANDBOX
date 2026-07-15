import { describe, it, expect } from "vitest";
import { normalizeEmail, normalizePhone, isValidEmail, isValidPhone } from "@/lib/donors/donorContact";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Donor@Example.COM  ")).toBe("donor@example.com");
  });
  it("returns null for empty/missing input", () => {
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
  });
});

describe("isValidEmail", () => {
  it("accepts a well-formed email", () => {
    expect(isValidEmail("donor@example.com")).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });
});

describe("normalizePhone", () => {
  it("normalizes a 10-digit US number to E.164", () => {
    expect(normalizePhone("8165551234")).toBe("+18165551234");
    expect(normalizePhone("(816) 555-1234")).toBe("+18165551234");
  });
  it("normalizes an 11-digit number beginning with 1", () => {
    expect(normalizePhone("18165551234")).toBe("+18165551234");
  });
  it("rejects a length that doesn't match a US number, e.g. a bank routing number", () => {
    expect(normalizePhone("123456789")).toBeNull(); // 9 digits — routing number length
    expect(normalizePhone("12345678901234567")).toBeNull(); // 17 digits — bank account length
  });
  it("returns null for missing input", () => {
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("matches normalizePhone's acceptance", () => {
    expect(isValidPhone("8165551234")).toBe(true);
    expect(isValidPhone("123")).toBe(false);
  });
});
