-- Adds the option to print the Public Display Name (instead of the legal name) on PDF receipts and year-end statements.
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "receiptUseDisplayName" BOOLEAN NOT NULL DEFAULT false;
