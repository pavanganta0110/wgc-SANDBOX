import { describe, it, expect } from "vitest";
import { publicOrgName, legalDocOrgName } from "../orgDisplayName";

describe("publicOrgName", () => {
  const base = { name: "Collegiate Impact Incorporated", statementSenderName: null, publicDisplayName: null };

  it("prefers the Public Display Name donors should see", () => {
    expect(publicOrgName({ ...base, publicDisplayName: "Collegiate Impact" })).toBe("Collegiate Impact");
  });

  it("ignores a blank display name and falls back to the statement sender name, then the legal name", () => {
    expect(publicOrgName({ ...base, publicDisplayName: "   ", statementSenderName: "CI Ministry" })).toBe("CI Ministry");
    expect(publicOrgName(base)).toBe("Collegiate Impact Incorporated");
  });
});

describe("legalDocOrgName (PDF receipt and year-end statements)", () => {
  const church = { name: "Collegiate Impact Incorporated", statementSenderName: null, publicDisplayName: "Collegiate Impact", receiptUseDisplayName: false };

  it("keeps the legal name by default, so tax documents don't change on their own", () => {
    expect(legalDocOrgName(church)).toBe("Collegiate Impact Incorporated");
  });

  it("uses the Statement Sender Name when one is set", () => {
    expect(legalDocOrgName({ ...church, statementSenderName: "CI Ministry" })).toBe("CI Ministry");
  });

  it("uses the Public Display Name once the organization turns the option on", () => {
    expect(legalDocOrgName({ ...church, receiptUseDisplayName: true })).toBe("Collegiate Impact");
    expect(legalDocOrgName({ ...church, receiptUseDisplayName: true, statementSenderName: "CI Ministry" })).toBe("Collegiate Impact");
  });

  it("falls back to the legal name if the option is on but no display name is set", () => {
    expect(legalDocOrgName({ ...church, publicDisplayName: "  ", receiptUseDisplayName: true })).toBe("Collegiate Impact Incorporated");
  });
});
