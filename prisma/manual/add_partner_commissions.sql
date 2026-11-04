-- Partner commissions: agents, effective-dated rates, profit adjustments, frozen monthly statements and payouts.
-- Additive and idempotent. `prisma db push` creates the same objects at build time.

ALTER TABLE "PartnerUser" ADD COLUMN IF NOT EXISTS "agentId" TEXT;
CREATE INDEX IF NOT EXISTS "PartnerUser_agentId_idx" ON "PartnerUser"("agentId");
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "partnerAgentId" TEXT;

CREATE TABLE IF NOT EXISTS "PartnerAgent" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerAgent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerAgent_partnerId_idx" ON "PartnerAgent"("partnerId");

CREATE TABLE IF NOT EXISTS "PartnerRateTerm" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "agentId" TEXT, "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "rateBps" INTEGER NOT NULL, "createdByEmail" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerRateTerm_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerRateTerm_partnerId_agentId_effectiveFrom_idx" ON "PartnerRateTerm"("partnerId","agentId","effectiveFrom");

CREATE TABLE IF NOT EXISTS "PartnerProfitAdjustment" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "churchId" TEXT NOT NULL, "month" TIMESTAMP(3) NOT NULL,
  "amountCents" INTEGER NOT NULL, "reason" TEXT NOT NULL, "createdByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerProfitAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerProfitAdjustment_partnerId_month_idx" ON "PartnerProfitAdjustment"("partnerId","month");

CREATE TABLE IF NOT EXISTS "PartnerCommissionStatement" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "month" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'FINAL',
  "profitCents" INTEGER NOT NULL, "wgcCents" INTEGER NOT NULL, "partnerCents" INTEGER NOT NULL,
  "agentsCents" INTEGER NOT NULL, "partnerKeepsCents" INTEGER NOT NULL, "linesJson" JSONB NOT NULL,
  "finalizedByEmail" TEXT, "finalizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerCommissionStatement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerCommissionStatement_partnerId_month_key" ON "PartnerCommissionStatement"("partnerId","month");

CREATE TABLE IF NOT EXISTS "PartnerCommissionPayout" (
  "id" TEXT NOT NULL, "partnerId" TEXT NOT NULL, "agentId" TEXT, "month" TIMESTAMP(3) NOT NULL,
  "amountCents" INTEGER NOT NULL, "paidAt" TIMESTAMP(3) NOT NULL, "method" TEXT, "note" TEXT,
  "recordedByEmail" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerCommissionPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerCommissionPayout_partnerId_month_idx" ON "PartnerCommissionPayout"("partnerId","month");

DO $$ BEGIN ALTER TABLE "PartnerAgent" ADD CONSTRAINT "PartnerAgent_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PartnerRateTerm" ADD CONSTRAINT "PartnerRateTerm_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PartnerProfitAdjustment" ADD CONSTRAINT "PartnerProfitAdjustment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PartnerCommissionStatement" ADD CONSTRAINT "PartnerCommissionStatement_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "PartnerCommissionPayout" ADD CONSTRAINT "PartnerCommissionPayout_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
