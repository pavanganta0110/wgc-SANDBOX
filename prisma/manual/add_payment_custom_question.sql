-- Org-defined giving-page question ("How did you hear about us?") and the donor's answer, per payment.
-- Additive and nullable. `prisma db push` at build also applies it; this file is for running it by hand first.
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customQuestion" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "customAnswer" TEXT;
