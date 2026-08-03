-- Wires invoice payments into the existing annual/year-end statement
-- system. Additive only.

ALTER TABLE "InvoicePayment"
  ADD COLUMN IF NOT EXISTS "feeContributionRefundedCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AnnualDonationStatementLine"
  ADD COLUMN IF NOT EXISTS "invoicePaymentId" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceNumberSnapshot" TEXT;
