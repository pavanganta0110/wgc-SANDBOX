import { describe, it, expect } from "vitest";
import { computeClientDisplayName } from "../clientDisplayName";

describe("computeClientDisplayName", () => {
  it("joins first and last name for an individual", () => {
    expect(computeClientDisplayName({ clientType: "INDIVIDUAL", firstName: "Jane", lastName: "Smith" })).toBe("Jane Smith");
  });

  it("uses only first name when last name is missing", () => {
    expect(computeClientDisplayName({ clientType: "INDIVIDUAL", firstName: "Jane", lastName: null })).toBe("Jane");
  });

  it("uses organization name for an organization client", () => {
    expect(computeClientDisplayName({ clientType: "ORGANIZATION", organizationName: "Acme Co" })).toBe("Acme Co");
  });

  it("falls back to Unnamed Client when nothing is provided", () => {
    expect(computeClientDisplayName({ clientType: "INDIVIDUAL" })).toBe("Unnamed Client");
  });

  it("falls back sensibly for an organization with no organization name but a contact name", () => {
    expect(computeClientDisplayName({ clientType: "ORGANIZATION", firstName: "Jane", lastName: "Smith" })).toBe("Jane Smith");
  });
});
