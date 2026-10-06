import { describe, it, expect } from "vitest";
import { donorInfoMessage } from "@/lib/giving/donorInfoMessage";

describe("donorInfoMessage", () => {
  it("still asks for a phone number when phone is required (ordinary giving pages, phone-required events)", () => {
    expect(donorInfoMessage({ phoneOptional: false, nameAndEmailOk: false })).toBe("Enter your name, email, and phone number to continue.");
    expect(donorInfoMessage({ phoneOptional: false, nameAndEmailOk: true })).toBe("Enter your name, email, and phone number to continue.");
  });

  it("does not mention a phone number when it is optional and name/email are missing", () => {
    const msg = donorInfoMessage({ phoneOptional: true, nameAndEmailOk: false });
    expect(msg).toBe("Enter your name and email to continue.");
    expect(msg).not.toMatch(/phone/i);
  });

  it("explains a too-short typed phone when phone is optional and everything else is fine", () => {
    expect(donorInfoMessage({ phoneOptional: true, nameAndEmailOk: true })).toBe("Enter a full 10-digit phone number, or leave it blank.");
  });
});
