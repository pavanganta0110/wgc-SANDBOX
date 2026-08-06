import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { loadDotEnvLocal } from "./loadEnv";

loadDotEnvLocal();

/**
 * Seeds two isolated churches (main-account style) plus one already-paid
 * invoice, directly against the sandbox database this dev server points
 * at (DATABASE_URL from .env.local) — the same pattern generateStatement's
 * and reconciliation's own Vitest suites use for DB-adjacent fixtures,
 * just via a real connection since this suite drives a real browser
 * against a real running server rather than mocking Prisma. Writes raw
 * public tokens to a JSON fixture file (never persisted anywhere else —
 * mirrors how invoicePublicToken.ts only ever hands the raw token back
 * once) that the spec files and globalTeardown both read.
 */
const FIXTURE_PATH = path.join(__dirname, ".fixtures.json");

function mintToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export default async function globalSetup() {
  const prisma = new PrismaClient();
  const runId = crypto.randomBytes(4).toString("hex");

  try {
    const churchA = await prisma.church.create({
      data: {
        name: `E2E Wallet Test Church A ${runId}`,
        slug: `e2e-wallet-a-${runId}`,
        primaryContactEmail: `e2e-a-${runId}@example.com`,
        status: "ACTIVE",
        finixMerchantId: "MU_e2e_test_a",
      },
    });
    const clientA = await prisma.client.create({
      data: { churchId: churchA.id, displayName: "E2E Test Client A", email: `client-a-${runId}@example.com` },
    });
    const invoiceA = await prisma.invoice.create({
      data: {
        churchId: churchA.id,
        clientId: clientA.id,
        invoiceNumber: `E2E-A-${runId}`,
        status: "SENT",
        classification: "GOODS_OR_SERVICES",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotalCents: 10000,
        totalCents: 10000,
        balanceCents: 10000,
        allowCard: true,
        allowAch: true,
        allowApplePay: true,
        allowGooglePay: true,
        allowFeeCoverage: true,
        allowPartialPayments: false,
      },
    });
    const tokenA = mintToken();
    await prisma.invoicePublicToken.create({ data: { invoiceId: invoiceA.id, churchId: churchA.id, tokenHash: tokenA.tokenHash } });

    const churchB = await prisma.church.create({
      data: {
        name: `E2E Wallet Test Church B ${runId}`,
        slug: `e2e-wallet-b-${runId}`,
        primaryContactEmail: `e2e-b-${runId}@example.com`,
        status: "ACTIVE",
        finixMerchantId: "MU_e2e_test_b",
      },
    });
    const clientB = await prisma.client.create({
      data: { churchId: churchB.id, displayName: "E2E Test Client B", email: `client-b-${runId}@example.com` },
    });
    const invoiceB = await prisma.invoice.create({
      data: {
        churchId: churchB.id,
        clientId: clientB.id,
        invoiceNumber: `E2E-B-${runId}`,
        status: "SENT",
        classification: "GOODS_OR_SERVICES",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotalCents: 25000,
        totalCents: 25000,
        balanceCents: 25000,
        allowCard: true,
        allowAch: true,
        allowApplePay: true,
        allowGooglePay: true,
        allowFeeCoverage: true,
      },
    });
    const tokenB = mintToken();
    await prisma.invoicePublicToken.create({ data: { invoiceId: invoiceB.id, churchId: churchB.id, tokenHash: tokenB.tokenHash } });

    // Already-paid invoice — used to confirm a paid invoice's public page
    // never shows active wallet/payment controls, only the receipt/history.
    const invoicePaid = await prisma.invoice.create({
      data: {
        churchId: churchA.id,
        clientId: clientA.id,
        invoiceNumber: `E2E-PAID-${runId}`,
        status: "PAID",
        classification: "GOODS_OR_SERVICES",
        issueDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotalCents: 5000,
        totalCents: 5000,
        amountPaidCents: 5000,
        balanceCents: 0,
        paidAt: new Date(),
        allowApplePay: true,
        allowGooglePay: true,
        allowFeeCoverage: true,
      },
    });
    await prisma.invoicePayment.create({
      data: {
        invoiceId: invoicePaid.id,
        churchId: churchA.id,
        source: "FINIX",
        method: "CARD",
        grossAmountCents: 5000,
        processingFeeCents: 175,
        netAmountCents: 5153,
        feeContributionCents: 153,
        totalChargedCents: 5153,
        customerCoveredFee: true,
        status: "SUCCEEDED",
        finixTransferId: `TR_e2e_paid_${runId}`,
      },
    });
    const tokenPaid = mintToken();
    await prisma.invoicePublicToken.create({ data: { invoiceId: invoicePaid.id, churchId: churchA.id, tokenHash: tokenPaid.tokenHash } });

    fs.writeFileSync(
      FIXTURE_PATH,
      JSON.stringify(
        {
          runId,
          churchAId: churchA.id,
          churchBId: churchB.id,
          invoiceAId: invoiceA.id,
          invoiceBId: invoiceB.id,
          invoicePaidId: invoicePaid.id,
          tokenA: tokenA.token,
          tokenB: tokenB.token,
          tokenPaid: tokenPaid.token,
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect();
  }
}
