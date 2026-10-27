-- Donor portal (slice 1): one-time login codes + church-scoped sessions.
-- Additive only. Apply to sandbox first; never run against production
-- without review.

CREATE TABLE "DonorLoginCode" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "donorId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "linkTokenHash" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DonorLoginCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DonorLoginCode_linkTokenHash_key" ON "DonorLoginCode"("linkTokenHash");
CREATE INDEX "DonorLoginCode_churchId_donorId_createdAt_idx" ON "DonorLoginCode"("churchId", "donorId", "createdAt");

CREATE TABLE "DonorPortalSession" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "donorId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastActiveAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DonorPortalSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DonorPortalSession_tokenHash_key" ON "DonorPortalSession"("tokenHash");
CREATE INDEX "DonorPortalSession_churchId_donorId_idx" ON "DonorPortalSession"("churchId", "donorId");
