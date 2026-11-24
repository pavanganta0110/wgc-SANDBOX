-- Email code sign-in inside a partner's frame. Additive and idempotent; `prisma db push` creates the same table at build time.
CREATE TABLE IF NOT EXISTS "PartnerEmbedEmailCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerEmbedEmailCode_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PartnerEmbedEmailCode_userId_createdAt_idx" ON "PartnerEmbedEmailCode"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "PartnerEmbedEmailCode_expiresAt_idx" ON "PartnerEmbedEmailCode"("expiresAt");
