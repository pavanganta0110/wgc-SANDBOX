import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Static source-scan tests proving the WGC-only IRS letter feature never
 * touches Finix. This codebase has no existing harness for mocking Finix
 * API calls end-to-end, so — consistent with this repo's established
 * testing approach (pure-function tests only, no DB/network mocking) —
 * these tests assert on the actual file contents/import graph rather than
 * intercepting a live call. If any of these files is ever edited to
 * import @/lib/finix/client, these tests fail immediately.
 */
function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Finix separation guard", () => {
  it("the IRS letter service never imports the Finix client", () => {
    const source = read("src/lib/onboarding/irsLetterService.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/finix\/client["']/);
    expect(source).not.toMatch(/finixClient/);
  });

  it("the organization-facing IRS letter upload route never imports the Finix client", () => {
    const source = read("src/app/api/onboarding/[applicationId]/irs-letter/route.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/finix\/client["']/);
    expect(source).not.toMatch(/finixClient/);
  });

  it("the admin IRS letter access route never imports the Finix client", () => {
    const source = read("src/app/api/admin/onboarding-applications/[applicationId]/irs-letter/access/route.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/finix\/client["']/);
    expect(source).not.toMatch(/finixClient/);
  });

  it("the admin IRS letter review route never imports the Finix client", () => {
    const source = read("src/app/api/admin/onboarding-applications/[applicationId]/irs-letter/review/route.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/finix\/client["']/);
    expect(source).not.toMatch(/finixClient/);
  });

  it("the Supabase storage wrapper never imports the Finix client", () => {
    const source = read("src/lib/storage/supabaseStorage.ts");
    expect(source).not.toMatch(/from ["']@\/lib\/finix\/client["']/);
    expect(source).not.toMatch(/finixClient/);
  });

  it("the main onboarding submission route was not modified to reference the WGC-internal document feature", () => {
    const source = read("src/app/api/onboarding/route.ts");
    expect(source).not.toMatch(/OnboardingInternalDocument/);
    expect(source).not.toMatch(/WGC_INTERNAL/);
    expect(source).not.toMatch(/IRS_501C3_DETERMINATION_LETTER/);
    expect(source).not.toMatch(/irsLetter/i);
  });

  it("the Finix client module was not modified to reference the WGC-internal document feature", () => {
    const source = read("src/lib/finix/client.ts");
    expect(source).not.toMatch(/OnboardingInternalDocument/);
    expect(source).not.toMatch(/WGC_INTERNAL/);
    expect(source).not.toMatch(/IRS_501C3_DETERMINATION_LETTER/);
  });

  it("assertNeverSentToFinix throws for a WGC_INTERNAL-category document", async () => {
    const { assertNeverSentToFinix } = await import("@/lib/onboarding/wgcInternalDocumentGuard");
    expect(() => assertNeverSentToFinix({ category: "WGC_INTERNAL" }, "test-context")).toThrow();
  });

  it("assertNeverSentToFinix does not throw for a non-WGC_INTERNAL document or a missing document", async () => {
    const { assertNeverSentToFinix } = await import("@/lib/onboarding/wgcInternalDocumentGuard");
    expect(() => assertNeverSentToFinix({ category: "ADDITIONAL_DOCUMENTATION" }, "test-context")).not.toThrow();
    expect(() => assertNeverSentToFinix(null, "test-context")).not.toThrow();
    expect(() => assertNeverSentToFinix(undefined, "test-context")).not.toThrow();
  });
});
