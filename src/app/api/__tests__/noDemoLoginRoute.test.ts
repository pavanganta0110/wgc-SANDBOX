import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// CVE-class regression guard: src/app/api/demo/login/route.ts and
// src/app/api/demo/seed/route.ts previously existed in this (production)
// repository. demo/login created a real, fully authenticated OWNER-role
// session for a real merchant (admin@gracecommunity.org / Grace Community
// Church) with zero authentication check — anyone who requested the URL
// was logged in. demo/seed was an unauthenticated destructive endpoint
// that ran deleteMany across FinixTransfer/Payment/Invoice/Client/
// ExternalDonation/Donor/User/Church, including one deleteMany scoped
// only by a hardcoded email with no church scoping. Both were removed
// entirely rather than env-var-gated: a route that doesn't exist can
// never be re-enabled by a misconfigured environment variable. This test
// fails the build if either route file, or any other file matching the
// same unauthenticated-session or unauthenticated-destructive shape, is
// ever reintroduced here.
describe("no unauthenticated demo/test login or seed route exists in this repo", () => {
  const apiDir = path.join(__dirname, "..");

  function walk(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name === "route.ts" ? [full] : [];
    });
  }

  it("src/app/api/demo/login does not exist", () => {
    const demoLoginPath = path.join(apiDir, "demo", "login", "route.ts");
    expect(fs.existsSync(demoLoginPath)).toBe(false);
  });

  it("src/app/api/demo/seed does not exist", () => {
    const demoSeedPath = path.join(apiDir, "demo", "seed", "route.ts");
    expect(fs.existsSync(demoSeedPath)).toBe(false);
  });

  it("no route file calls prisma.<model>.deleteMany without an auth check in the same file", () => {
    const routeFiles = walk(apiDir);
    const suspicious: string[] = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.includes("deleteMany(")) continue;
      const hasAuthCheck =
        content.includes("requireMerchantSession") ||
        content.includes("getAdminSession") ||
        content.includes("getSession") ||
        content.includes("finix-signature") ||
        content.includes("CRON_SECRET");
      if (!hasAuthCheck) suspicious.push(path.relative(apiDir, file));
    }
    expect(suspicious).toEqual([]);
  });

  it("no route file calls setSessionCookie without a preceding password/credential check", () => {
    const routeFiles = walk(apiDir);
    const suspicious: string[] = [];
    for (const file of routeFiles) {
      const content = fs.readFileSync(file, "utf8");
      if (!content.includes("setSessionCookie")) continue;
      const hasCredentialCheck =
        content.includes("verifyPassword") ||
        content.includes("requireMerchantSession") ||
        content.includes("requireOrganizationAccess") ||
        content.includes("getAdminSession") ||
        content.includes("verifySessionToken") ||
        content.includes("finix-signature") ||
        content.includes("CRON_SECRET") ||
        content.includes("id_token") || // OAuth callback verification
        content.includes("code_verifier") || // OAuth PKCE
        content.includes("TokenHash") || // password-reset/invite/set-password: hashed, expiry-checked token verified against the DB before session creation
        content.includes("TokenExpiresAt");
      if (!hasCredentialCheck) suspicious.push(path.relative(apiDir, file));
    }
    expect(suspicious).toEqual([]);
  });
});
