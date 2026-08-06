-- CreateTable
CREATE TABLE "BulkReceiptJob" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "targetIds" JSONB NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BulkReceiptJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkReceiptJob_churchId_status_idx" ON "BulkReceiptJob"("churchId", "status");

