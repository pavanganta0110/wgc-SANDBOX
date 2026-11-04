-- View-only partner team members. Every existing login stays FULL.
ALTER TABLE "PartnerUser" ADD COLUMN IF NOT EXISTS "staffRole" TEXT NOT NULL DEFAULT 'FULL';
