-- ============================================================================
-- Aplos Integration — targeted additive sandbox schema change
-- ============================================================================
--
-- Source: hand-isolated from `npx prisma migrate diff --from-url <sandbox DIRECT_URL>
-- --to-schema-datamodel prisma/schema.prisma --script`, run against the confirmed
-- sandbox project (kasbpdsdnhgqogxmfsgm) on 2026-07-29. The raw diff output also
-- contained unrelated statements (DROP COLUMN "Payment"."source", DROP COLUMN
-- x2 on "SupportTicket", CREATE TABLE for FirstLookLead/FirstLookLeadNote/
-- FirstLookLeadActivity, one ContactInquiry index) — none of that is included
-- here. This file contains ONLY the 5 Aplos tables, their indexes, unique
-- constraints, and foreign keys, manually isolated and reviewed line-by-line
-- against the raw diff before being written here.
--
-- Target: sandbox only (kasbpdsdnhgqogxmfsgm). Never run against production
-- (ocjfmeovajwxwbdqhram) or with production credentials.
--
-- Statement inventory (5 CREATE TABLE, 10 CREATE INDEX, 5 ADD CONSTRAINT):
--   CREATE TABLE:  AplosConnection, AplosPurposeMapping,
--                   AplosAccountConfiguration, AplosSyncRecord, AplosSyncAttempt
--   UNIQUE INDEX:   AplosConnection(churchId)
--                   AplosPurposeMapping(churchId, wgcFundId)
--                   AplosAccountConfiguration(churchId)
--                   AplosSyncRecord(churchId, settlementId, syncVersion)
--                     — the financially-critical duplicate-prevention constraint
--   PLAIN INDEX:    AplosConnection(status)
--                   AplosConnection(automaticSyncEnabled)
--                   AplosPurposeMapping(churchId)
--                   AplosSyncRecord(churchId, status)
--                   AplosSyncRecord(status, nextAttemptAt)
--                   AplosSyncAttempt(syncRecordId)
--   FOREIGN KEY:    AplosConnection.churchId -> Church.id
--                   AplosPurposeMapping.churchId -> AplosConnection.churchId
--                   AplosAccountConfiguration.churchId -> AplosConnection.churchId
--                   AplosSyncRecord.churchId -> AplosConnection.churchId
--                   AplosSyncAttempt.syncRecordId -> AplosSyncRecord.id
--
-- NOTE on scope: AplosPurposeMapping.wgcFundId, AplosSyncRecord.settlementId,
-- and AplosSyncRecord.donationId are intentionally plain string columns, NOT
-- enforced foreign keys to Fund/FinixSettlement/Payment — matching this
-- schema's existing convention (see Payment.attributedUserId,
-- Church.primaryOwnerUserId) of plain-string cross-references where a hard FK
-- isn't appropriate (e.g. settlementId/donationId are nullable for a future
-- non-settlement-based sync type). There are exactly 5 real foreign keys in
-- this change, not more.
--
-- Confirmed: NO DROP TABLE, NO DROP COLUMN, NO ALTER of any existing
-- unrelated column. The only touch to a pre-existing table is the new
-- AplosConnection -> Church foreign key, which adds a constraint referencing
-- Church.id and modifies nothing about the Church table itself.
--
-- Idempotency: every statement below is written to be safe to run more than
-- once. CREATE TABLE / CREATE INDEX use IF NOT EXISTS. Foreign key
-- constraints (Postgres has no ADD CONSTRAINT IF NOT EXISTS) are wrapped in a
-- DO block that checks pg_constraint first. The whole script runs in one
-- transaction — a second run either changes nothing (everything already
-- exists) or, if interrupted, rolls back atomically, never leaving a partial
-- state.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- CREATE TABLE
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "AplosConnection" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "privateKeyFingerprint" TEXT NOT NULL,
    "encryptionKeyFingerprint" TEXT NOT NULL,
    "aplosOrganizationId" TEXT,
    "aplosOrganizationName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
    "automaticSyncEnabled" BOOLEAN NOT NULL DEFAULT false,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "connectedAt" TIMESTAMP(3),
    "lastConnectionTestAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AplosConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AplosPurposeMapping" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "wgcFundId" TEXT NOT NULL,
    "aplosPurposeId" TEXT NOT NULL,
    "aplosPurposeName" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AplosPurposeMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AplosAccountConfiguration" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "depositAccountId" TEXT NOT NULL,
    "depositAccountName" TEXT NOT NULL,
    "processingFeeExpenseAccountId" TEXT NOT NULL,
    "processingFeeExpenseAccountName" TEXT NOT NULL,
    "defaultPurposeId" TEXT NOT NULL,
    "defaultPurposeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AplosAccountConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AplosSyncRecord" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "settlementId" TEXT,
    "donationId" TEXT,
    "syncType" TEXT NOT NULL DEFAULT 'SETTLEMENT_BATCH',
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "blockedReason" TEXT,
    "payloadHash" TEXT,
    "aplosContributionId" TEXT,
    "aplosBatchId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "requiresManualReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AplosSyncRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AplosSyncAttempt" (
    "id" TEXT NOT NULL,
    "syncRecordId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "safeErrorCode" TEXT,
    "safeErrorMessage" TEXT,
    "result" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AplosSyncAttempt_pkey" PRIMARY KEY ("id")
);

-- ----------------------------------------------------------------------------
-- CREATE INDEX (unique constraints and plain indexes)
-- ----------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS "AplosConnection_churchId_key" ON "AplosConnection"("churchId");
CREATE INDEX IF NOT EXISTS "AplosConnection_status_idx" ON "AplosConnection"("status");
CREATE INDEX IF NOT EXISTS "AplosConnection_automaticSyncEnabled_idx" ON "AplosConnection"("automaticSyncEnabled");

CREATE INDEX IF NOT EXISTS "AplosPurposeMapping_churchId_idx" ON "AplosPurposeMapping"("churchId");
CREATE UNIQUE INDEX IF NOT EXISTS "AplosPurposeMapping_churchId_wgcFundId_key" ON "AplosPurposeMapping"("churchId", "wgcFundId");

CREATE UNIQUE INDEX IF NOT EXISTS "AplosAccountConfiguration_churchId_key" ON "AplosAccountConfiguration"("churchId");

CREATE INDEX IF NOT EXISTS "AplosSyncRecord_churchId_status_idx" ON "AplosSyncRecord"("churchId", "status");
CREATE INDEX IF NOT EXISTS "AplosSyncRecord_status_nextAttemptAt_idx" ON "AplosSyncRecord"("status", "nextAttemptAt");
-- The financially-critical duplicate-prevention constraint: makes it
-- structurally impossible for one settlement to be synced to Aplos twice
-- under the same sync generation.
CREATE UNIQUE INDEX IF NOT EXISTS "AplosSyncRecord_churchId_settlementId_syncVersion_key" ON "AplosSyncRecord"("churchId", "settlementId", "syncVersion");

CREATE INDEX IF NOT EXISTS "AplosSyncAttempt_syncRecordId_idx" ON "AplosSyncAttempt"("syncRecordId");

-- ----------------------------------------------------------------------------
-- ADD FOREIGN KEY — each wrapped in a pg_constraint existence check so the
-- statement is safe to run more than once (Postgres has no native
-- ADD CONSTRAINT IF NOT EXISTS).
-- ----------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AplosConnection_churchId_fkey'
  ) THEN
    ALTER TABLE "AplosConnection"
      ADD CONSTRAINT "AplosConnection_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AplosPurposeMapping_churchId_fkey'
  ) THEN
    ALTER TABLE "AplosPurposeMapping"
      ADD CONSTRAINT "AplosPurposeMapping_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AplosAccountConfiguration_churchId_fkey'
  ) THEN
    ALTER TABLE "AplosAccountConfiguration"
      ADD CONSTRAINT "AplosAccountConfiguration_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AplosSyncRecord_churchId_fkey'
  ) THEN
    ALTER TABLE "AplosSyncRecord"
      ADD CONSTRAINT "AplosSyncRecord_churchId_fkey"
      FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AplosSyncAttempt_syncRecordId_fkey'
  ) THEN
    ALTER TABLE "AplosSyncAttempt"
      ADD CONSTRAINT "AplosSyncAttempt_syncRecordId_fkey"
      FOREIGN KEY ("syncRecordId") REFERENCES "AplosSyncRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
