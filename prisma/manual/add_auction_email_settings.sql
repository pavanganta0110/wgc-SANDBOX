-- Auctions: the organization's own wording for the automatic emails. Idempotent.
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "emailSettingsJson" JSONB;
