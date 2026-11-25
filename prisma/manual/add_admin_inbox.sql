-- Admin Inbox (Zoho Mail): three new tables. Additive only. `prisma db push` at build also applies it.
CREATE TABLE IF NOT EXISTS "InboxMailbox" (
  "id" TEXT PRIMARY KEY, "provider" TEXT NOT NULL DEFAULT 'zoho', "emailAddress" TEXT NOT NULL UNIQUE,
  "providerAccountId" TEXT NOT NULL, "dataCenter" TEXT NOT NULL DEFAULT 'com', "encryptedRefreshToken" TEXT NOT NULL,
  "connectedByAdminEmail" TEXT NOT NULL, "lastSyncAt" TIMESTAMP(3), "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE IF NOT EXISTS "InboxMessage" (
  "id" TEXT PRIMARY KEY, "mailboxId" TEXT NOT NULL REFERENCES "InboxMailbox"("id"), "providerMessageId" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'IN', "fromEmail" TEXT NOT NULL, "fromName" TEXT, "toEmail" TEXT, "subject" TEXT NOT NULL,
  "bodyText" TEXT NOT NULL, "receivedAt" TIMESTAMP(3) NOT NULL, "classification" TEXT NOT NULL, "classificationReason" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NEW', "churchId" TEXT, "ticketId" TEXT, "assignedToAdminEmail" TEXT, "handledByAdminEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "InboxMessage_mailboxId_providerMessageId_key" ON "InboxMessage"("mailboxId","providerMessageId");
CREATE INDEX IF NOT EXISTS "InboxMessage_classification_status_receivedAt_idx" ON "InboxMessage"("classification","status","receivedAt");
CREATE INDEX IF NOT EXISTS "InboxMessage_ticketId_idx" ON "InboxMessage"("ticketId");
CREATE INDEX IF NOT EXISTS "InboxMessage_fromEmail_idx" ON "InboxMessage"("fromEmail");
CREATE TABLE IF NOT EXISTS "InboxSenderRule" (
  "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "pattern" TEXT NOT NULL UNIQUE, "createdByEmail" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
