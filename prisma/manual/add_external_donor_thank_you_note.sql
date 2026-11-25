-- Optional personal thank-you note per external (outside-the-link) donation, shown on the donor receipt email.
-- Additive and nullable. `prisma db push` at build also applies it; this file is for running it by hand first.
ALTER TABLE "ExternalDonation" ADD COLUMN IF NOT EXISTS "donorThankYouNote" TEXT;
