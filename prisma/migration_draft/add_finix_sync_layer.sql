-- AlterTable
ALTER TABLE "OnboardingApplication" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspensionReason" TEXT,
ADD COLUMN     "terminatedAt" TIMESTAMP(3),
ADD COLUMN     "terminationReason" TEXT,
ADD COLUMN     "terminationStatus" TEXT;

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "finixApplicationId" TEXT;

-- CreateTable
CREATE TABLE "FinixMerchantSnapshot" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "finixIdentityId" TEXT,
    "finixMerchantId" TEXT NOT NULL,
    "finixApplicationId" TEXT,
    "finixProcessor" TEXT,
    "onboardingState" TEXT,
    "merchantState" TEXT,
    "processingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "settlementEnabled" BOOLEAN NOT NULL DEFAULT false,
    "verificationState" TEXT,
    "riskState" TEXT,
    "payoutProfileId" TEXT,
    "merchantProfileId" TEXT,
    "feeProfileId" TEXT,
    "terminationStatus" TEXT,
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "rawStateRedacted" JSONB,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinixMerchantSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixTransfer" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "paymentId" TEXT,
    "finixTransferId" TEXT NOT NULL,
    "finixMerchantId" TEXT,
    "finixBuyerIdentityId" TEXT,
    "finixPaymentInstrumentId" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "state" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "feeCents" INTEGER,
    "applicationFeeCents" INTEGER,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "traceId" TEXT,
    "statementDescriptor" TEXT,
    "source" TEXT,
    "tagsJson" JSONB,
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixRefundOrReversal" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "refundRequestId" TEXT,
    "originalPaymentId" TEXT,
    "finixReversalId" TEXT NOT NULL,
    "finixOriginalTransferId" TEXT,
    "finixMerchantId" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "state" TEXT,
    "reason" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "type" TEXT,
    "subtype" TEXT,
    "source" TEXT,
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixRefundOrReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixFee" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "finixFeeId" TEXT,
    "linkedToId" TEXT,
    "linkedToType" TEXT,
    "feeType" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "state" TEXT,
    "description" TEXT,
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinixFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixSettlement" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "finixSettlementId" TEXT NOT NULL,
    "finixMerchantId" TEXT,
    "state" TEXT,
    "totalAmountCents" INTEGER,
    "netAmountCents" INTEGER,
    "feeAmountCents" INTEGER,
    "refundAmountCents" INTEGER,
    "disputeAmountCents" INTEGER,
    "currency" TEXT,
    "accruedAt" TIMESTAMP(3),
    "settledAt" TIMESTAMP(3),
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "rawJsonRedacted" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixFundingTransferAttempt" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "finixFundingTransferAttemptId" TEXT NOT NULL,
    "finixSettlementId" TEXT,
    "finixMerchantId" TEXT,
    "state" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "bankAccountLast4" TEXT,
    "bankAccountType" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "estimatedArrivalDate" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixFundingTransferAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixDispute" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "finixDisputeId" TEXT NOT NULL,
    "finixTransferId" TEXT,
    "paymentId" TEXT,
    "finixMerchantId" TEXT,
    "state" TEXT,
    "reason" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "evidenceDueAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixDispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixPaymentInstrumentSnapshot" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "donorId" TEXT,
    "finixPaymentInstrumentId" TEXT NOT NULL,
    "finixIdentityId" TEXT,
    "instrumentType" TEXT,
    "paymentMethodType" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardExpirationMonth" INTEGER,
    "cardExpirationYear" INTEGER,
    "bankLast4" TEXT,
    "bankAccountType" TEXT,
    "accountHolderName" TEXT,
    "state" TEXT,
    "enabled" BOOLEAN,
    "instrumentUse" TEXT,
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixPaymentInstrumentSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixSubscription" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "churchSubscriptionId" TEXT,
    "finixSubscriptionId" TEXT NOT NULL,
    "finixMerchantId" TEXT,
    "finixBuyerIdentityId" TEXT,
    "finixPaymentInstrumentId" TEXT,
    "state" TEXT,
    "amountCents" INTEGER,
    "currency" TEXT,
    "billingInterval" TEXT,
    "collectionMethod" TEXT,
    "nextBillingDate" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "rawJsonRedacted" JSONB,
    "createdAtFinix" TIMESTAMP(3),
    "updatedAtFinix" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),

    CONSTRAINT "FinixSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixSyncJob" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "churchId" TEXT,
    "finixMerchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "recordsCreated" INTEGER NOT NULL DEFAULT 0,
    "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
    "cursor" TEXT,
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinixSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinixRawEventArchive" (
    "id" TEXT NOT NULL,
    "finixEventId" TEXT,
    "entity" TEXT,
    "eventType" TEXT,
    "resourceId" TEXT,
    "churchId" TEXT,
    "finixMerchantId" TEXT,
    "payloadRedactedJson" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinixRawEventArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantStatusHistory" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "previousStatus" TEXT,
    "newStatus" TEXT NOT NULL,
    "source" TEXT,
    "finixEventId" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emailTriggered" BOOLEAN NOT NULL DEFAULT false,
    "emailLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSnapshot" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "reportType" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossVolumeCents" INTEGER,
    "netVolumeCents" INTEGER,
    "refundAmountCents" INTEGER,
    "feeAmountCents" INTEGER,
    "disputeAmountCents" INTEGER,
    "payoutAmountCents" INTEGER,
    "donorCount" INTEGER,
    "transactionCount" INTEGER,
    "failedTransactionCount" INTEGER,
    "payloadJson" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefundRequest" (
    "id" TEXT NOT NULL,
    "churchId" TEXT,
    "originalPaymentId" TEXT,
    "requestedByEmail" TEXT,
    "amountCents" INTEGER,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchPricing" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "pricingPlanName" TEXT,
    "cardPercentageFee" DOUBLE PRECISION,
    "cardFixedFeeCents" INTEGER,
    "achFixedFeeCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchPricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinixMerchantSnapshot_finixMerchantId_key" ON "FinixMerchantSnapshot"("finixMerchantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixTransfer_finixTransferId_key" ON "FinixTransfer"("finixTransferId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixRefundOrReversal_finixReversalId_key" ON "FinixRefundOrReversal"("finixReversalId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixFee_finixFeeId_key" ON "FinixFee"("finixFeeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixSettlement_finixSettlementId_key" ON "FinixSettlement"("finixSettlementId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixFundingTransferAttempt_finixFundingTransferAttemptId_key" ON "FinixFundingTransferAttempt"("finixFundingTransferAttemptId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixDispute_finixDisputeId_key" ON "FinixDispute"("finixDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixPaymentInstrumentSnapshot_finixPaymentInstrumentId_key" ON "FinixPaymentInstrumentSnapshot"("finixPaymentInstrumentId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixSubscription_finixSubscriptionId_key" ON "FinixSubscription"("finixSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "FinixRawEventArchive_finixEventId_key" ON "FinixRawEventArchive"("finixEventId");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchPricing_churchId_key" ON "ChurchPricing"("churchId");

