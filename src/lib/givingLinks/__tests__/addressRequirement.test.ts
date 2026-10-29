import { describe, it, expect } from "vitest";
import { applyOrgAddressRequirement } from "../addressRequirement";
import { DEFAULT_DONOR_FIELD_SETTINGS } from "../types";

const optionalLink = {
  collectMailingAddress: false,
  donorFieldSettings: { ...DEFAULT_DONOR_FIELD_SETTINGS, street: "OPTIONAL" as const },
};

describe("applyOrgAddressRequirement", () => {
  it("leaves the link's own settings untouched when the organization rule is off", () => {
    expect(applyOrgAddressRequirement(false, optionalLink)).toBe(optionalLink);
    expect(applyOrgAddressRequirement(null, optionalLink)).toBe(optionalLink);
    expect(applyOrgAddressRequirement(undefined, optionalLink)).toBe(optionalLink);
  });

  it("forces the address to be collected and required on every link when the rule is on", () => {
    const result = applyOrgAddressRequirement(true, optionalLink);
    expect(result.collectMailingAddress).toBe(true);
    expect(result.donorFieldSettings.street).toBe("REQUIRED");
  });

  it("overrides a link that hides the address entirely", () => {
    const hidden = { collectMailingAddress: true, donorFieldSettings: { ...DEFAULT_DONOR_FIELD_SETTINGS, street: "HIDDEN" as const } };
    expect(applyOrgAddressRequirement(true, hidden).donorFieldSettings.street).toBe("REQUIRED");
  });

  it("changes nothing else about the link's donor fields and doesn't mutate its input", () => {
    const result = applyOrgAddressRequirement(true, optionalLink);
    expect(result.donorFieldSettings).toEqual({ ...optionalLink.donorFieldSettings, street: "REQUIRED" });
    expect(optionalLink.collectMailingAddress).toBe(false);
    expect(optionalLink.donorFieldSettings.street).toBe("OPTIONAL");
  });
});
