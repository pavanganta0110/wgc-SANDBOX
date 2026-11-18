-- Auctions: live-room "on the block" item, and donor/category on items. Idempotent.
ALTER TABLE "Auction" ADD COLUMN IF NOT EXISTS "currentItemId" TEXT;
ALTER TABLE "AuctionItem" ADD COLUMN IF NOT EXISTS "donatedBy" TEXT;
ALTER TABLE "AuctionItem" ADD COLUMN IF NOT EXISTS "category" TEXT;
