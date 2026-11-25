-- Admin Inbox: private per-admin mailboxes. Additive and nullable (null = shared mailbox). `prisma db push` at build also applies it.
ALTER TABLE "InboxMailbox" ADD COLUMN IF NOT EXISTS "ownerAdminUserId" TEXT;
CREATE INDEX IF NOT EXISTS "InboxMailbox_ownerAdminUserId_idx" ON "InboxMailbox"("ownerAdminUserId");
