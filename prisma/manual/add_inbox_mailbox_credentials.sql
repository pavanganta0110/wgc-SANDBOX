-- Admin Inbox: label and optional per-mailbox Zoho keys. Additive and nullable. `prisma db push` at build also applies it.
ALTER TABLE "InboxMailbox" ADD COLUMN IF NOT EXISTS "label" TEXT;
ALTER TABLE "InboxMailbox" ADD COLUMN IF NOT EXISTS "clientId" TEXT;
ALTER TABLE "InboxMailbox" ADD COLUMN IF NOT EXISTS "encryptedClientSecret" TEXT;
