-- ============================================================================
-- Ledger feed, salutation, required address and embedded login — additive schema
-- ============================================================================
--
-- The three schema changes from the ledger-feed work, as idempotent additive SQL
-- (IF NOT EXISTS everywhere, so it is safe to run more than once, and nothing is
-- dropped or rewritten):
--   1. "Church"."requireDonorAddress"  — organization-wide required mailing address
--   2. "Donor"."salutation"            — mailing-list salutation ("Mr. and Mrs.")
--   3. "EmbedLoginToken"               — one-time links for embedded partner login
--
-- `prisma db push` (run by `npm run build`) creates the same objects; this file
-- exists so they can be applied to the sandbox database BEFORE the new code is
-- deployed. Check which database you are connected to before running it.
-- ============================================================================

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "requireDonorAddress" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Donor" ADD COLUMN IF NOT EXISTS "salutation" TEXT;

CREATE TABLE IF NOT EXISTS "EmbedLoginToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiKeyId" TEXT,
    "redirectTo" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmbedLoginToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EmbedLoginToken_tokenHash_key" ON "EmbedLoginToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "EmbedLoginToken_churchId_userId_idx" ON "EmbedLoginToken"("churchId", "userId");
CREATE INDEX IF NOT EXISTS "EmbedLoginToken_expiresAt_idx" ON "EmbedLoginToken"("expiresAt");
