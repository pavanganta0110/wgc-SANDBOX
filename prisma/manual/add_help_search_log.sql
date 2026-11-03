-- Help Center search log (what people asked, whether an article matched). Additive: a new table only.
-- Apply to sandbox first; `npm run build` also creates it via `prisma db push`.
CREATE TABLE IF NOT EXISTS "HelpSearchLog" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "userId" TEXT,
  "query" TEXT NOT NULL,
  "matched" BOOLEAN NOT NULL,
  "topSlug" TEXT,
  "topScore" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HelpSearchLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HelpSearchLog_churchId_createdAt_idx" ON "HelpSearchLog"("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "HelpSearchLog_matched_createdAt_idx" ON "HelpSearchLog"("matched", "createdAt");
