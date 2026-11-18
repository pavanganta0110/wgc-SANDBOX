-- Auctions: silent online and live-room auctions, bidder registration, bids, wins.
-- Idempotent: safe to run more than once. Run before deploying the auctions code.

CREATE TABLE IF NOT EXISTS "Auction" (
  "id" TEXT PRIMARY KEY, "churchId" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "coverImageUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT', "format" TEXT NOT NULL DEFAULT 'SILENT',
  "startsAt" TIMESTAMP(3) NOT NULL, "endsAt" TIMESTAMP(3) NOT NULL,
  "autoExtendWindowMinutes" INTEGER NOT NULL DEFAULT 5, "autoExtendMinutes" INTEGER NOT NULL DEFAULT 5,
  "registrationMode" TEXT NOT NULL DEFAULT 'OPEN',
  "paymentWindowHours" INTEGER NOT NULL DEFAULT 72, "offerNextBidder" BOOLEAN NOT NULL DEFAULT true,
  "goalCents" INTEGER, "settledAt" TIMESTAMP(3), "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Auction_slug_key" ON "Auction"("slug");
CREATE INDEX IF NOT EXISTS "Auction_churchId_status_idx" ON "Auction"("churchId", "status");
CREATE INDEX IF NOT EXISTS "Auction_status_endsAt_idx" ON "Auction"("status", "endsAt");

CREATE TABLE IF NOT EXISTS "AuctionItem" (
  "id" TEXT PRIMARY KEY, "churchId" TEXT NOT NULL, "auctionId" TEXT NOT NULL,
  "itemNumber" INTEGER NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "imageUrl" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "startingBidCents" INTEGER NOT NULL, "minIncrementCents" INTEGER NOT NULL DEFAULT 500,
  "buyNowCents" INTEGER, "fairMarketValueCents" INTEGER NOT NULL DEFAULT 0,
  "currentBidCents" INTEGER, "highBidderId" TEXT, "bidCount" INTEGER NOT NULL DEFAULT 0,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN', "closedAt" TIMESTAMP(3),
  "winnerBidderId" TEXT, "winningBidCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionItem_auctionId_itemNumber_key" ON "AuctionItem"("auctionId", "itemNumber");
CREATE INDEX IF NOT EXISTS "AuctionItem_churchId_auctionId_idx" ON "AuctionItem"("churchId", "auctionId");
CREATE INDEX IF NOT EXISTS "AuctionItem_auctionId_status_idx" ON "AuctionItem"("auctionId", "status");

CREATE TABLE IF NOT EXISTS "AuctionBidder" (
  "id" TEXT PRIMARY KEY, "churchId" TEXT NOT NULL, "auctionId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "email" TEXT NOT NULL, "normalizedEmail" TEXT NOT NULL, "phone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING', "bidderNumber" INTEGER, "emailVerifiedAt" TIMESTAMP(3),
  "verifyCodeHash" TEXT, "verifyCodeExpiresAt" TIMESTAMP(3), "verifyAttempts" INTEGER NOT NULL DEFAULT 0,
  "sessionTokenHash" TEXT, "donorId" TEXT, "clientId" TEXT, "addedByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionBidder_auctionId_normalizedEmail_key" ON "AuctionBidder"("auctionId", "normalizedEmail");
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionBidder_auctionId_bidderNumber_key" ON "AuctionBidder"("auctionId", "bidderNumber");
CREATE INDEX IF NOT EXISTS "AuctionBidder_churchId_auctionId_status_idx" ON "AuctionBidder"("churchId", "auctionId", "status");

CREATE TABLE IF NOT EXISTS "AuctionBid" (
  "id" TEXT PRIMARY KEY, "churchId" TEXT NOT NULL, "auctionId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "bidderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL, "source" TEXT NOT NULL DEFAULT 'ONLINE', "enteredByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionBid_itemId_amountCents_key" ON "AuctionBid"("itemId", "amountCents");
CREATE INDEX IF NOT EXISTS "AuctionBid_auctionId_createdAt_idx" ON "AuctionBid"("auctionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuctionBid_bidderId_idx" ON "AuctionBid"("bidderId");

CREATE TABLE IF NOT EXISTS "AuctionWin" (
  "id" TEXT PRIMARY KEY, "churchId" TEXT NOT NULL, "auctionId" TEXT NOT NULL, "itemId" TEXT NOT NULL, "bidderId" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING_PAYMENT',
  "invoiceId" TEXT, "invoiceClaimedAt" TIMESTAMP(3), "dueAt" TIMESTAMP(3), "offeredFromBidderId" TEXT, "paidAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "AuctionWin_itemId_key" ON "AuctionWin"("itemId");
CREATE INDEX IF NOT EXISTS "AuctionWin_churchId_auctionId_status_idx" ON "AuctionWin"("churchId", "auctionId", "status");
CREATE INDEX IF NOT EXISTS "AuctionWin_bidderId_idx" ON "AuctionWin"("bidderId");
CREATE INDEX IF NOT EXISTS "AuctionWin_status_dueAt_idx" ON "AuctionWin"("status", "dueAt");
