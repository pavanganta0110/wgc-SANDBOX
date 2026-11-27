-- Fundraising Scorecard tables. The build's `prisma db push` also creates these; run this first if you prefer.
CREATE TABLE IF NOT EXISTS "ScorecardContact" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "dataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ScorecardContact_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScorecardContact_email_key" ON "ScorecardContact"("email");

CREATE TABLE IF NOT EXISTS "ScorecardUsedTransfer" (
  "transferId" TEXT NOT NULL,
  "contactId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScorecardUsedTransfer_pkey" PRIMARY KEY ("transferId")
);
CREATE INDEX IF NOT EXISTS "ScorecardUsedTransfer_contactId_idx" ON "ScorecardUsedTransfer"("contactId");

CREATE TABLE IF NOT EXISTS "ScorecardRateHit" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScorecardRateHit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ScorecardRateHit_key_createdAt_idx" ON "ScorecardRateHit"("key", "createdAt");
