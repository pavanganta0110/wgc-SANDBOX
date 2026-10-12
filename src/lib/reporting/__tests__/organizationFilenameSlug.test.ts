import { describe, it, expect } from "vitest";
import { organizationFilenameSlug } from "../export";

describe("organizationFilenameSlug", () => {
  it("hyphenates and lowercases the organization name", () => {
    expect(organizationFilenameSlug("Waypoint Gateway Collective")).toBe("waypoint-gateway-collective");
  });
  it("strips accents and punctuation", () => {
    expect(organizationFilenameSlug("St. José's Church, Inc.")).toBe("st-jose-s-church-inc");
  });
  it("falls back when there is no usable name", () => {
    expect(organizationFilenameSlug("")).toBe("organization");
    expect(organizationFilenameSlug(null)).toBe("organization");
    expect(organizationFilenameSlug("!!!")).toBe("organization");
  });
});
