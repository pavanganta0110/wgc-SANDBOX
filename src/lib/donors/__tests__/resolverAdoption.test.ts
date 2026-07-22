import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guards the actual root-cause fix: every payment/subscription creation
 * path that resolves a donor must go through resolveOrCreateDonor(), and
 * none of them may re-introduce the old `donor.upsert({ where: {
 * finixIdentityId } } })` pattern — which always created a new Donor row
 * for a brand-new Finix identity (a near-certainty on public checkout,
 * where a saved payment instrument is rarely reused), regardless of a
 * matching email already on file. That pattern is exactly what produced
 * 15+ duplicate Donor rows for one person across card/ACH/wallet/
 * recurring checkouts.
 */
function readSource(relativePath: string): string {
  return readFileSync(join(__dirname, "../../../..", relativePath), "utf-8");
}

describe("Shared donor resolver adoption", () => {
  it("the public donate route (card, ACH, Apple Pay, Google Pay, recurring) uses resolveOrCreateDonor and not a bare finixIdentityId upsert", () => {
    const source = readSource("src/app/api/g/[slug]/donate/route.ts");
    expect(source).toContain('import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor"');
    expect(source).not.toMatch(/donor\.upsert\(\s*\{\s*where:\s*\{\s*finixIdentityId/);
    // Both the saved-instrument branch and the new-instrument (card/ACH/wallet) branch call it.
    expect(source.match(/resolveOrCreateDonor\(/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("the admin Take a Payment route uses resolveOrCreateDonor and not a bare finixIdentityId upsert", () => {
    const source = readSource("src/app/api/merchant/transactions/payments/take-payment/route.ts");
    expect(source).toContain('import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor"');
    expect(source).not.toMatch(/donor\.upsert\(\s*\{\s*where:\s*\{\s*finixIdentityId/);
  });

  it("the donor CSV import commit route resolves through the same shared resolver, not a raw prisma.donor.create loop", () => {
    const source = readSource("src/app/api/merchant/donors/import/commit/route.ts");
    expect(source).toContain('import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor"');
    expect(source).toContain("resolveOrCreateDonor({");
  });
});
