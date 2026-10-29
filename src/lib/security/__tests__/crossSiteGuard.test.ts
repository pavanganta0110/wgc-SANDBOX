import { describe, it, expect } from "vitest";
import { isCrossSiteStateChange } from "../crossSiteGuard";

describe("isCrossSiteStateChange", () => {
  it("blocks writes the browser says came from another site", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      expect(isCrossSiteStateChange(method, "cross-site")).toBe(true);
    }
  });

  it("allows same-origin, same-site and user-initiated writes", () => {
    expect(isCrossSiteStateChange("POST", "same-origin")).toBe(false);
    expect(isCrossSiteStateChange("POST", "same-site")).toBe(false);
    expect(isCrossSiteStateChange("POST", "none")).toBe(false);
  });

  it("allows a write from a client that doesn't send the header (non-browser callers)", () => {
    expect(isCrossSiteStateChange("POST", null)).toBe(false);
  });

  it("never blocks reads, even cross-site", () => {
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(isCrossSiteStateChange(method, "cross-site")).toBe(false);
    }
  });
});
