-- AlterTable
ALTER TABLE "ExternalDonation" ADD COLUMN     "deductibleAmountCents" INTEGER,
ADD COLUMN     "goodsOrServicesDescription" TEXT,
ADD COLUMN     "goodsOrServicesProvided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "goodsOrServicesValueCents" INTEGER,
ADD COLUMN     "importBatchId" TEXT,
ADD COLUMN     "importFingerprint" TEXT,
ADD COLUMN     "importRowNumber" INTEGER,
ADD COLUMN     "isTaxDeductible" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ExternalDonationImportBatch" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedByUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADED',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "successRows" INTEGER NOT NULL DEFAULT 0,
    "failedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "totalAmountCents" INTEGER NOT NULL DEFAULT 0,
    "receiptOption" TEXT,
    "receiptsQueued" INTEGER NOT NULL DEFAULT 0,
    "receiptsSent" INTEGER NOT NULL DEFAULT 0,
    "receiptsFailed" INTEGER NOT NULL DEFAULT 0,
    "columnMappingJson" JSONB,
    "errorSummary" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDonationImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalDonationImportRow" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rawDataJson" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorsJson" JSONB,
    "warningsJson" JSONB,
    "donorResolution" TEXT,
    "externalDonationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDonationImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalDonationImportBatch_churchId_idx" ON "ExternalDonationImportBatch"("churchId");

-- CreateIndex
CREATE INDEX "ExternalDonationImportBatch_churchId_status_idx" ON "ExternalDonationImportBatch"("churchId", "status");

-- CreateIndex
CREATE INDEX "ExternalDonationImportBatch_churchId_createdAt_idx" ON "ExternalDonationImportBatch"("churchId", "createdAt");

-- CreateIndex
CREATE INDEX "ExternalDonationImportRow_importBatchId_idx" ON "ExternalDonationImportRow"("importBatchId");

-- CreateIndex
CREATE INDEX "ExternalDonationImportRow_fingerprint_idx" ON "ExternalDonationImportRow"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalDonationImportRow_importBatchId_rowNumber_key" ON "ExternalDonationImportRow"("importBatchId", "rowNumber");

-- CreateIndex
CREATE INDEX "ExternalDonation_churchId_importFingerprint_idx" ON "ExternalDonation"("churchId", "importFingerprint");

-- CreateIndex
CREATE INDEX "ExternalDonation_importBatchId_idx" ON "ExternalDonation"("importBatchId");

-- AddForeignKey
ALTER TABLE "ExternalDonation" ADD CONSTRAINT "ExternalDonation_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ExternalDonationImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDonationImportRow" ADD CONSTRAINT "ExternalDonationImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ExternalDonationImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

