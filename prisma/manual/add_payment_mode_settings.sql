-- Payment-processor mode (e.g. MBTS): per-organization switches.
-- Additive only (defaults keep every existing org's behavior unchanged).
-- Apply to sandbox first; never run against production without review.
-- `npm run build` also applies the same changes via `prisma db push`.

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "paymentMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "receiptNoteMode" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "termFieldEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "brandedDashboard" BOOLEAN NOT NULL DEFAULT false;

-- Supporting documents attached to a transaction (bytes are in private object storage).
CREATE TABLE IF NOT EXISTS "TransactionDocument" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "finixTransferId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "storageKey" TEXT NOT NULL,
  "uploadedByUserId" TEXT,
  "uploadedByEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  CONSTRAINT "TransactionDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TransactionDocument_churchId_finixTransferId_idx" ON "TransactionDocument"("churchId", "finixTransferId");
