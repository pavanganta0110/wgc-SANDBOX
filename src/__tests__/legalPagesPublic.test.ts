import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { config as middlewareConfig } from "@/middleware";

const PUBLIC_LEGAL_PATHS = ["/legal/sms-consent", "/legal/privacy", "/legal/terms"];

function pathIsGatedByMiddleware(pathname: string): boolean {
  return middlewareConfig.matcher.some((pattern) => {
    // Matcher entries look like "/merchant/:path*" — a prefix match on the
    // literal segment before the dynamic part is enough to prove a given
    // /legal/* path was never intended to be covered by any of them.
    const prefix = pattern.split(":")[0];
    return pathname === prefix || pathname.startsWith(prefix);
  });
}

describe("Public legal pages are reachable without authentication", () => {
  it.each(PUBLIC_LEGAL_PATHS)("%s is not covered by the auth-gating middleware matcher", (pathname) => {
    expect(pathIsGatedByMiddleware(pathname)).toBe(false);
  });

  it("the SMS consent screenshot assets referenced by /legal/sms-consent exist and are non-empty", () => {
    const assetDir = path.join(process.cwd(), "public", "legal", "sms-consent");
    const files = ["mfa-enrollment-unchecked.png", "mfa-enrollment-checked.png"];
    for (const file of files) {
      const filePath = path.join(assetDir, file);
      expect(fs.existsSync(filePath), `${file} should exist in public/legal/sms-consent/`).toBe(true);
      expect(fs.statSync(filePath).size).toBeGreaterThan(1000);
    }
  });
});
