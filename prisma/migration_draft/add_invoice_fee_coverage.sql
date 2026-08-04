-- Adds customer-selectable fee-coverage support to invoices.
-- Additive only: new nullable/defaulted columns, no drops, no renames.

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "allowFeeCoverage" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "InvoicePayment"
  ADD COLUMN IF NOT EXISTS "feeContributionCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalChargedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "customerCoveredFee" BOOLEAN NOT NULL DEFAULT false;
