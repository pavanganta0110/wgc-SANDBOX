import { describe, it, expect } from "vitest";
import { parseFrameAncestorOrigins, partnerFrameAncestorsDirective } from "../frameAncestors";

describe("parseFrameAncestorOrigins", () => {
  it("returns nothing when the variable is unset or blank, so default behavior is unchanged", () => {
    expect(parseFrameAncestorOrigins(undefined, "production")).toEqual({ origins: [], rejected: [] });
    expect(parseFrameAncestorOrigins("  ", "production")).toEqual({ origins: [], rejected: [] });
  });

  it("accepts https origins separated by commas or spaces and drops duplicates and trailing slashes", () => {
    const { origins, rejected } = parseFrameAncestorOrigins("https://app.cvprotools.com, https://app.cvcampusos.com/ https://app.cvprotools.com", "production");
    expect(origins).toEqual(["https://app.cvprotools.com", "https://app.cvcampusos.com"]);
    expect(rejected).toEqual([]);
  });

  it("accepts a wildcard subdomain host with at least two labels after the wildcard", () => {
    expect(parseFrameAncestorOrigins("https://*.leadconnectorhq.com", "production").origins).toEqual(["https://*.leadconnectorhq.com"]);
  });

  it("rejects bare wildcards and wildcards over a whole TLD", () => {
    const { origins, rejected } = parseFrameAncestorOrigins("* https://*.com https://*. https://*", "production");
    expect(origins).toEqual([]);
    expect(rejected).toEqual(["*", "https://*.com", "https://*.", "https://*"]);
  });

  it("rejects http, paths, queries, credentials and non-web schemes in production", () => {
    const { origins, rejected } = parseFrameAncestorOrigins(
      "http://app.cvprotools.com https://a.com/path https://a.com/?x=1 https://u:p@a.com data:text/html javascript:alert(1) //a.com",
      "production"
    );
    expect(origins).toEqual([]);
    expect(rejected).toHaveLength(7);
  });

  it("rejects anything that could inject another CSP directive", () => {
    const { origins, rejected } = parseFrameAncestorOrigins("https://a.com;script-src https://b.com'", "production");
    expect(origins).toEqual([]);
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("allows http only for localhost, and only outside production", () => {
    expect(parseFrameAncestorOrigins("http://localhost:3001", "development").origins).toEqual(["http://localhost:3001"]);
    expect(parseFrameAncestorOrigins("http://localhost:3001", "production")).toEqual({ origins: [], rejected: ["http://localhost:3001"] });
    expect(parseFrameAncestorOrigins("http://evil.example", "development").origins).toEqual([]);
  });

  it("keeps valid entries and reports only the bad ones", () => {
    expect(parseFrameAncestorOrigins("https://app.cvprotools.com,https://*.com", "production")).toEqual({
      origins: ["https://app.cvprotools.com"],
      rejected: ["https://*.com"],
    });
  });
});

describe("partnerFrameAncestorsDirective", () => {
  it("always keeps 'self' and appends the allowed origins", () => {
    expect(partnerFrameAncestorsDirective(["https://app.cvprotools.com"])).toBe("frame-ancestors 'self' https://app.cvprotools.com");
    expect(partnerFrameAncestorsDirective([])).toBe("frame-ancestors 'self'");
  });
});
