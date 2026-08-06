import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SQL_SCRIPT = `
-- CreateTable
CREATE TABLE "AplosConnection" (
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

-- CreateTable
CREATE TABLE "AplosPurposeMapping" (
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

-- CreateTable
CREATE TABLE "AplosAccountConfiguration" (
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

-- CreateTable
CREATE TABLE "AplosSyncRecord" (
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

-- CreateTable
CREATE TABLE "AplosSyncAttempt" (
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

-- CreateIndex
CREATE UNIQUE INDEX "AplosConnection_churchId_key" ON "AplosConnection"("churchId");

-- CreateIndex
CREATE INDEX "AplosConnection_status_idx" ON "AplosConnection"("status");

-- CreateIndex
CREATE INDEX "AplosConnection_automaticSyncEnabled_idx" ON "AplosConnection"("automaticSyncEnabled");

-- CreateIndex
CREATE INDEX "AplosPurposeMapping_churchId_idx" ON "AplosPurposeMapping"("churchId");

-- CreateIndex
CREATE UNIQUE INDEX "AplosPurposeMapping_churchId_wgcFundId_key" ON "AplosPurposeMapping"("churchId", "wgcFundId");

-- CreateIndex
CREATE UNIQUE INDEX "AplosAccountConfiguration_churchId_key" ON "AplosAccountConfiguration"("churchId");

-- CreateIndex
CREATE INDEX "AplosSyncRecord_churchId_status_idx" ON "AplosSyncRecord"("churchId", "status");

-- CreateIndex
CREATE INDEX "AplosSyncRecord_status_nextAttemptAt_idx" ON "AplosSyncRecord"("status", "nextAttemptAt");

-- CreateIndex
CREATE UNIQUE INDEX "AplosSyncRecord_churchId_settlementId_syncVersion_key" ON "AplosSyncRecord"("churchId", "settlementId", "syncVersion");

-- CreateIndex
CREATE INDEX "AplosSyncAttempt_syncRecordId_idx" ON "AplosSyncAttempt"("syncRecordId");

-- AddConstraints
ALTER TABLE "AplosConnection" ADD CONSTRAINT "AplosConnection_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AplosPurposeMapping" ADD CONSTRAINT "AplosPurposeMapping_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AplosAccountConfiguration" ADD CONSTRAINT "AplosAccountConfiguration_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AplosSyncRecord" ADD CONSTRAINT "AplosSyncRecord_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "AplosConnection"("churchId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AplosSyncAttempt" ADD CONSTRAINT "AplosSyncAttempt_syncRecordId_fkey" FOREIGN KEY ("syncRecordId") REFERENCES "AplosSyncRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
`;

export async function GET() {
  const statements = SQL_SCRIPT.split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const results = [];
  for (const statement of statements) {
    try {
      const res = await prisma.$executeRawUnsafe(statement);
      results.push({ statement: statement.substring(0, 50) + "...", success: true, res });
    } catch (err: any) {
      results.push({ statement: statement.substring(0, 50) + "...", success: false, error: err.message });
    }
  }

  return NextResponse.json({ success: true, results });
}
