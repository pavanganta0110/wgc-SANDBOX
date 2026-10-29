-- Partner dashboard: Partner, PartnerUser, and the partner link on Church.
-- Additive and idempotent; safe to run more than once. `prisma db push` creates
-- the same objects at build time, so run this first only where a column or table
-- must exist before the deploy.

CREATE TABLE IF NOT EXISTS "Partner" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "contactEmail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_slug_key" ON "Partner"("slug");

CREATE TABLE IF NOT EXISTS "PartnerUser" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT,
  "passwordHash" TEXT,
  "setPasswordTokenHash" TEXT,
  "setPasswordTokenExpiresAt" TIMESTAMP(3),
  "disabledAt" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "authVersion" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerUser_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerUser_email_key" ON "PartnerUser"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerUser_setPasswordTokenHash_key" ON "PartnerUser"("setPasswordTokenHash");
CREATE INDEX IF NOT EXISTS "PartnerUser_partnerId_idx" ON "PartnerUser"("partnerId");

DO $$ BEGIN
  ALTER TABLE "PartnerUser" ADD CONSTRAINT "PartnerUser_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "partnerReference" TEXT;
CREATE INDEX IF NOT EXISTS "Church_partnerId_idx" ON "Church"("partnerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Church_partnerId_partnerReference_key" ON "Church"("partnerId", "partnerReference");

DO $$ BEGIN
  ALTER TABLE "Church" ADD CONSTRAINT "Church_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partner API key, the partner's one webhook endpoint, and its delivery log.
CREATE TABLE IF NOT EXISTS "PartnerApiKey" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "hashedKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdByPartnerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "requestCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PartnerApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerApiKey_hashedKey_key" ON "PartnerApiKey"("hashedKey");
CREATE INDEX IF NOT EXISTS "PartnerApiKey_partnerId_idx" ON "PartnerApiKey"("partnerId");
DO $$ BEGIN
  ALTER TABLE "PartnerApiKey" ADD CONSTRAINT "PartnerApiKey_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PartnerWebhookEndpoint" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "subscribedEventsJson" JSONB NOT NULL,
  "signingSecretEncrypted" TEXT NOT NULL,
  "signingSecretLast4" TEXT NOT NULL,
  "createdByPartnerUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "disabledAt" TIMESTAMP(3),
  "disabledReason" TEXT,
  "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
  "lastDeliveryAt" TIMESTAMP(3),
  "lastSuccessAt" TIMESTAMP(3),
  CONSTRAINT "PartnerWebhookEndpoint_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerWebhookEndpoint_partnerId_key" ON "PartnerWebhookEndpoint"("partnerId");
DO $$ BEGIN
  ALTER TABLE "PartnerWebhookEndpoint" ADD CONSTRAINT "PartnerWebhookEndpoint_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PartnerWebhookDelivery" (
  "id" TEXT NOT NULL,
  "webhookEventId" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "partnerEndpointId" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextRetryAt" TIMESTAMP(3),
  "lastAttemptAt" TIMESTAMP(3),
  "responseStatusCode" INTEGER,
  "responseBodySnippet" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerWebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_partnerId_createdAt_idx" ON "PartnerWebhookDelivery"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_status_nextRetryAt_idx" ON "PartnerWebhookDelivery"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_webhookEventId_idx" ON "PartnerWebhookDelivery"("webhookEventId");

-- Partner onboarding: tag on applications, the partner's Get Started code,
-- partner-level events, and one billable approval per approved organization.
ALTER TABLE "OnboardingApplication" ADD COLUMN IF NOT EXISTS "partnerId" TEXT;
ALTER TABLE "OnboardingApplication" ADD COLUMN IF NOT EXISTS "partnerReference" TEXT;
CREATE INDEX IF NOT EXISTS "OnboardingApplication_partnerId_idx" ON "OnboardingApplication"("partnerId");

ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "onboardingCode" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "suppressMerchantEmails" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS "Partner_onboardingCode_key" ON "Partner"("onboardingCode");

ALTER TABLE "PartnerWebhookDelivery" ALTER COLUMN "webhookEventId" DROP NOT NULL;
ALTER TABLE "PartnerWebhookDelivery" ALTER COLUMN "churchId" DROP NOT NULL;
ALTER TABLE "PartnerWebhookDelivery" ADD COLUMN IF NOT EXISTS "partnerEventId" TEXT;
CREATE INDEX IF NOT EXISTS "PartnerWebhookDelivery_partnerEventId_idx" ON "PartnerWebhookDelivery"("partnerEventId");

CREATE TABLE IF NOT EXISTS "PartnerEvent" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "onboardingApplicationId" TEXT,
  "dataJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerEvent_partnerId_createdAt_idx" ON "PartnerEvent"("partnerId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerEvent_onboardingApplicationId_idx" ON "PartnerEvent"("onboardingApplicationId");

CREATE TABLE IF NOT EXISTS "PartnerBillableApproval" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "onboardingApplicationId" TEXT,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "billedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerBillableApproval_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerBillableApproval_churchId_key" ON "PartnerBillableApproval"("churchId");
CREATE INDEX IF NOT EXISTS "PartnerBillableApproval_partnerId_status_idx" ON "PartnerBillableApproval"("partnerId", "status");
DO $$ BEGIN
  ALTER TABLE "PartnerBillableApproval" ADD CONSTRAINT "PartnerBillableApproval_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Partner billing: price per merchant, the partner's saved card, and monthly invoices.
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "pricePerMerchantCents" INTEGER;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "billingIdentityId" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "billingPaymentInstrumentId" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "cardBrand" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "cardLast4" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "cardExpMonth" INTEGER;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "cardExpYear" INTEGER;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "billingContactEmail" TEXT;
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "billingAuthAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "billingAuthTermsVersion" TEXT;

CREATE TABLE IF NOT EXISTS "PartnerInvoice" (
  "id" TEXT NOT NULL,
  "partnerId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "merchantCount" INTEGER NOT NULL,
  "unitPriceCents" INTEGER NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "lineItemsJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "attemptBudget" INTEGER NOT NULL DEFAULT 4,
  "lastAttemptAt" TIMESTAMP(3),
  "nextAttemptAt" TIMESTAMP(3),
  "finixTransferId" TEXT,
  "failureReason" TEXT,
  "chargedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PartnerInvoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PartnerInvoice_partnerId_period_key" ON "PartnerInvoice"("partnerId", "period");
CREATE INDEX IF NOT EXISTS "PartnerInvoice_status_nextAttemptAt_idx" ON "PartnerInvoice"("status", "nextAttemptAt");
DO $$ BEGIN
  ALTER TABLE "PartnerInvoice" ADD CONSTRAINT "PartnerInvoice_partnerId_fkey"
    FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
