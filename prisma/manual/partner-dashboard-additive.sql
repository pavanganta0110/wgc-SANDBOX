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
