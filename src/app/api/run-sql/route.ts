import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const SQL_SCRIPT = `
-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "billingAccessRestrictedAt" TIMESTAMP(3),
ADD COLUMN     "billingSetupStatus" TEXT;

-- DropTable
DROP TABLE IF EXISTS "SubscriptionPlan" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "ChurchSubscription" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "SubscriptionCharge" CASCADE;

-- CreateTable
CREATE TABLE "WgcPricingVersion" (
    "id" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "monthlyAmountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "internalDescription" TEXT,
    "customerDescription" TEXT,
    "isDefaultForNewOrgs" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgcPricingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgcBillingAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "billingIdentityId" TEXT,
    "billingPaymentInstrumentId" TEXT,
    "billingMethodType" TEXT,
    "cardBrand" TEXT,
    "cardLast4" TEXT,
    "cardExpMonth" INTEGER,
    "cardExpYear" INTEGER,
    "bankLast4" TEXT,
    "maskedBillingDetails" TEXT,
    "billingContactEmail" TEXT,
    "authorizationAcceptedAt" TIMESTAMP(3),
    "authorizationTermsVersion" TEXT,
    "authorizationIpAddress" TEXT,
    "authorizationUserAgent" TEXT,
    "authorizingUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastUpdatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgcBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgcSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "planCode" TEXT NOT NULL,
    "priceVersionId" TEXT NOT NULL,
    "finixSubscriptionId" TEXT,
    "finixBillingMerchantId" TEXT NOT NULL,
    "billingIdentityId" TEXT,
    "billingPaymentInstrumentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "billingInterval" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'INCOMPLETE',
    "trialStartsAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "firstChargeAt" TIMESTAMP(3),
    "nextChargeAt" TIMESTAMP(3),
    "lastChargeAt" TIMESTAMP(3),
    "pastDueAt" TIMESTAMP(3),
    "gracePeriodEndsAt" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "canceledByUserId" TEXT,
    "cancellationReason" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WgcSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerDescription" TEXT,
    "durationMonths" INTEGER NOT NULL,
    "normalMonthlyAmountCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "automaticEligibilitySource" TEXT,
    "maxOrganizations" INTEGER,
    "allowManualGrantToExistingOrg" BOOLEAN NOT NULL DEFAULT false,
    "promotionWaivesPlatformFee" BOOLEAN NOT NULL DEFAULT true,
    "promotionWaivesInvoiceMonthlyFee" BOOLEAN NOT NULL DEFAULT false,
    "promotionWaivesInvoiceUsageFee" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionEntitlement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LEAD_CAPTURED',
    "durationMonths" INTEGER NOT NULL,
    "normalMonthlyAmountCents" INTEGER NOT NULL,
    "waivesPlatformFee" BOOLEAN NOT NULL DEFAULT true,
    "waivesInvoiceMonthlyFee" BOOLEAN NOT NULL DEFAULT false,
    "waivesInvoiceUsageFee" BOOLEAN NOT NULL DEFAULT false,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "firstPaidBillingDate" TIMESTAMP(3),
    "grantedByUserId" TEXT,
    "approvalReason" TEXT,
    "customerFacingExplanation" TEXT,
    "canceledAt" TIMESTAMP(3),
    "canceledByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "originalLeadId" TEXT,
    "finixSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionEntitlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionLead" (
    "id" TEXT NOT NULL,
    "organizationName" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "campaignSource" TEXT,
    "promotionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "signupStartedAt" TIMESTAMP(3),
    "onboardingApplicationId" TEXT,
    "organizationId" TEXT,
    "finixApplicationId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'LEAD_CAPTURED',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCharge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "chargeType" TEXT NOT NULL,
    "billingPeriod" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "finixTransferId" TEXT,
    "finixSubscriptionId" TEXT,
    "pricingVersionId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "internalNote" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceBillingConfiguration" (
    "id" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'DISABLED',
    "monthlyAmountCents" INTEGER,
    "usageAmountCents" INTEGER,
    "trigger" TEXT,
    "partialPaymentCountsAsBillable" BOOLEAN NOT NULL DEFAULT false,
    "multiplePaymentsCountOnce" BOOLEAN NOT NULL DEFAULT true,
    "minimumMonthlyChargeCents" INTEGER,
    "maximumMonthlyChargeCents" INTEGER,
    "freeUsageAllowance" INTEGER,
    "customerFacingDescription" TEXT,
    "showUsageAsEstimateBeforeBilling" BOOLEAN NOT NULL DEFAULT true,
    "promotionWaivesInvoiceFees" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveUntil" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdByUserId" TEXT,
    "activatedByUserId" TEXT,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceBillingConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceUsageEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoicePaymentId" TEXT,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceAmountCents" INTEGER,
    "amountPaidCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "billingPeriod" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "nonBillableReason" TEXT,
    "pricingVersionId" TEXT,
    "billingChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgcBillingAuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "internalReason" TEXT,
    "customerFacingReason" TEXT,
    "idempotencyKey" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WgcBillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingActivationToken" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingActivationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingEmailLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "emailType" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "relatedSubscriptionId" TEXT,
    "relatedChargeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "failureReason" TEXT,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTermsVersion" (
    "id" TEXT NOT NULL,
    "termsType" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedByUserId" TEXT,

    CONSTRAINT "BillingTermsVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WgcBillingSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
    "pastDueReminderDays" INTEGER[] DEFAULT ARRAY[1, 3, 7, 12]::INTEGER[],
    "trialEndingReminderDays" INTEGER[] DEFAULT ARRAY[14, 3, 1]::INTEGER[],
    "restrictedFeatureKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportContactEmail" TEXT,
    "updatedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WgcBillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WgcPricingVersion_planCode_status_idx" ON "WgcPricingVersion"("planCode", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WgcBillingAccount_organizationId_key" ON "WgcBillingAccount"("organizationId");

-- CreateIndex
CREATE INDEX "WgcBillingAccount_organizationId_idx" ON "WgcBillingAccount"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WgcSubscription_organizationId_key" ON "WgcSubscription"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "WgcSubscription_finixSubscriptionId_key" ON "WgcSubscription"("finixSubscriptionId");

-- CreateIndex
CREATE INDEX "WgcSubscription_organizationId_idx" ON "WgcSubscription"("organizationId");

-- CreateIndex
CREATE INDEX "WgcSubscription_status_idx" ON "WgcSubscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Promotion_code_key" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "Promotion_code_idx" ON "Promotion"("code");

-- CreateIndex
CREATE INDEX "PromotionEntitlement_organizationId_idx" ON "PromotionEntitlement"("organizationId");

-- CreateIndex
CREATE INDEX "PromotionEntitlement_status_idx" ON "PromotionEntitlement"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PromotionLead_tokenHash_key" ON "PromotionLead"("tokenHash");

-- CreateIndex
CREATE INDEX "PromotionLead_promotionId_idx" ON "PromotionLead"("promotionId");

-- CreateIndex
CREATE INDEX "PromotionLead_organizationId_idx" ON "PromotionLead"("organizationId");

-- CreateIndex
CREATE INDEX "PromotionLead_tokenExpiresAt_idx" ON "PromotionLead"("tokenExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCharge_idempotencyKey_key" ON "BillingCharge"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingCharge_organizationId_idx" ON "BillingCharge"("organizationId");

-- CreateIndex
CREATE INDEX "BillingCharge_chargeType_idx" ON "BillingCharge"("chargeType");

-- CreateIndex
CREATE INDEX "BillingCharge_billingPeriod_idx" ON "BillingCharge"("billingPeriod");

-- CreateIndex
CREATE INDEX "BillingCharge_status_idx" ON "BillingCharge"("status");

-- CreateIndex
CREATE INDEX "InvoiceBillingConfiguration_status_idx" ON "InvoiceBillingConfiguration"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceUsageEvent_idempotencyKey_key" ON "InvoiceUsageEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceUsageEvent_organizationId_idx" ON "InvoiceUsageEvent"("organizationId");

-- CreateIndex
CREATE INDEX "InvoiceUsageEvent_invoiceId_idx" ON "InvoiceUsageEvent"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceUsageEvent_billingPeriod_idx" ON "InvoiceUsageEvent"("billingPeriod");

-- CreateIndex
CREATE INDEX "InvoiceUsageEvent_eventType_idx" ON "InvoiceUsageEvent"("eventType");

-- CreateIndex
CREATE INDEX "WgcBillingAuditLog_organizationId_createdAt_idx" ON "WgcBillingAuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "WgcBillingAuditLog_entityType_entityId_idx" ON "WgcBillingAuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "WgcBillingAuditLog_action_idx" ON "WgcBillingAuditLog"("action");

-- CreateIndex
CREATE UNIQUE INDEX "BillingActivationToken_tokenHash_key" ON "BillingActivationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "BillingActivationToken_organizationId_idx" ON "BillingActivationToken"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingEmailLog_idempotencyKey_key" ON "BillingEmailLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "BillingEmailLog_organizationId_emailType_idx" ON "BillingEmailLog"("organizationId", "emailType");

-- CreateIndex
CREATE INDEX "BillingTermsVersion_termsType_idx" ON "BillingTermsVersion"("termsType");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTermsVersion_termsType_version_key" ON "BillingTermsVersion"("termsType", "version");
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
