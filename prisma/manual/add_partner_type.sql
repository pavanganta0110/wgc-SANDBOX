-- Partner type: SOFTWARE (default, unchanged for every existing partner) or REFERRAL.
ALTER TABLE "Partner" ADD COLUMN IF NOT EXISTS "partnerType" TEXT NOT NULL DEFAULT 'SOFTWARE';
