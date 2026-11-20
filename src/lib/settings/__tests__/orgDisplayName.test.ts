import { describe, it, expect } from "vitest";
import { publicOrgName } from "../orgDisplayName";

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
