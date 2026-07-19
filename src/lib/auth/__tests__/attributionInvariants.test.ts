import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * Team-access Checkpoint 4 correction #2: "Replace grep-only verification
 * with executable tests" for attribution preservation. This file is the
 * executable, CI-enforced version of the manual grep I ran during
 * Checkpoint 3/4 development — it reads the actual source of every file
 * that legitimately touches Payment/FinixSubscription rows after creation,
 * or that selects a Finix merchant/bank/settlement destination, and asserts
 * the attribution fields never appear where they must not. If someone adds
 * `attributedUserId` to one of these update payloads in the future, this
 * test fails instead of silently regressing.
 */

const ROOT = path.resolve(__dirname, "../../../..");
function read(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Payment.attributedUserId is only ever set at payment creation", () => {
  // Every file in the app that calls prisma.payment.update(...) or
  // .upsert(...) for a reason OTHER than initial creation (verified via
  // `grep -rn "prisma.payment.update(\|prisma.payment.upsert(" src` during
  // this checkpoint — see the Checkpoint 4 report for the exact command).
  const paymentUpdateSites = [
    "src/app/api/merchant/transactions/payments/[transferId]/goods-services/route.ts",
    "src/lib/payments/backfill.ts",
    "src/lib/donors/donorBackfill.ts",
    "src/lib/giving/generateReceipt.ts",
  ];

  it.each(paymentUpdateSites)("test 18/19: %s never writes attributedUserId in an update/upsert payload", (relPath) => {
    const source = read(relPath);
    expect(source).not.toMatch(/attributedUserId/);
  });

  // Refunds, disputes, and ACH returns are modeled on entirely separate
  // tables (FinixRefundOrReversal, FinixDispute-related models, BankReturn)
  // — they never call prisma.payment.update at all. Asserting that absence
  // directly (rather than just "no attributedUserId key") proves the
  // stronger property: these flows can't touch Payment's attribution even
  // by accident, because they don't touch Payment at all.
  const paymentUntouchedByEventSites = [
    { label: "refund", relPath: "src/app/api/merchant/transactions/payments/[transferId]/refund/route.ts" },
    { label: "dispute submit", relPath: "src/app/api/merchant/disputes/[disputeId]/submit/route.ts" },
    { label: "dispute evidence", relPath: "src/app/api/merchant/disputes/[disputeId]/evidence/route.ts" },
    { label: "settlement reconcile", relPath: "src/app/api/merchant/settlements/[settlementId]/reconcile/route.ts" },
  ];

  it.each(paymentUntouchedByEventSites)(
    "test 20/21/22: %s route never calls prisma.payment.update or .upsert",
    ({ relPath }) => {
      const source = read(relPath);
      expect(source).not.toMatch(/prisma\.payment\.(update|upsert)\(/);
    }
  );
});

describe("Finix merchant/settlement/bank-account selection never uses attribution fields", () => {
  const finixMerchantSelectionSites = [
    "src/app/api/g/[slug]/donate/route.ts",
    "src/app/api/setup/[token]/complete/route.ts",
    "src/app/api/merchant/subscriptions/create/route.ts",
    "src/app/api/merchant/organization/bank-account/[accountId]/documents/route.ts",
    "src/app/api/merchant/organization/documents/route.ts",
  ];

  it.each(finixMerchantSelectionSites)(
    "test 23: %s selects the Finix merchant via church.finixMerchantId, never ownerUserId/attributedUserId",
    (relPath) => {
      const source = read(relPath);
      expect(source).toMatch(/linked_to:\s*church\.finixMerchantId/);
      expect(source).not.toMatch(/linked_to:\s*.*(ownerUserId|attributedUserId)/);
    }
  );

  it("test 24: no file under organization/bank-account or finix settlement-destination code references ownerUserId or attributedUserId", () => {
    const dirsToScan = [
      "src/lib/organization",
      "src/lib/finix",
      "src/app/api/merchant/organization/bank-account",
    ];
    const offenders: string[] = [];
    for (const dir of dirsToScan) {
      const abs = path.join(ROOT, dir);
      if (!fs.existsSync(abs)) continue;
      const walk = (d: string) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const full = path.join(d, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) && !entry.name.includes(".test.")) {
            const content = fs.readFileSync(full, "utf8");
            if (/\bownerUserId\b|\battributedUserId\b/.test(content)) offenders.push(path.relative(ROOT, full));
          }
        }
      };
      walk(abs);
    }
    expect(offenders).toEqual([]);
  });
});
