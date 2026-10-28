-- Student Giving: roster, term charges, gift-to-student tagging.
-- Additive only (nullable columns / new tables). Apply to sandbox first;
-- never run against production without review. `npm run build` also applies
-- the same changes via `prisma db push`.

ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "studentGivingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Church" ADD COLUMN IF NOT EXISTS "studentCurrentTerm" TEXT;

ALTER TABLE "GivingLink" ADD COLUMN IF NOT EXISTS "studentSelectionEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GivingLink" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "GivingLink" ADD COLUMN IF NOT EXISTS "studentTermLabel" TEXT;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "studentTermLabel" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "studentGivenFor" TEXT;
CREATE INDEX IF NOT EXISTS "Payment_churchId_studentId_idx" ON "Payment"("churchId", "studentId");

ALTER TABLE "ExternalDonation" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "ExternalDonation" ADD COLUMN IF NOT EXISTS "studentTermLabel" TEXT;
ALTER TABLE "ExternalDonation" ADD COLUMN IF NOT EXISTS "studentGivenFor" TEXT;

ALTER TABLE "FinixSubscription" ADD COLUMN IF NOT EXISTS "studentId" TEXT;
ALTER TABLE "FinixSubscription" ADD COLUMN IF NOT EXISTS "studentTermLabel" TEXT;
ALTER TABLE "FinixSubscription" ADD COLUMN IF NOT EXISTS "studentGivenFor" TEXT;

CREATE TABLE IF NOT EXISTS "Student" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "studentNumber" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "email" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Student_churchId_studentNumber_key" ON "Student"("churchId", "studentNumber");
CREATE INDEX IF NOT EXISTS "Student_churchId_lastName_idx" ON "Student"("churchId", "lastName");

CREATE TABLE IF NOT EXISTS "StudentTermCharge" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "termLabel" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "source" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentTermCharge_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StudentTermCharge_studentId_termLabel_key" ON "StudentTermCharge"("studentId", "termLabel");
CREATE INDEX IF NOT EXISTS "StudentTermCharge_churchId_termLabel_idx" ON "StudentTermCharge"("churchId", "termLabel");

CREATE TABLE IF NOT EXISTS "StudentAssignmentAudit" (
  "id" TEXT NOT NULL,
  "churchId" TEXT NOT NULL,
  "paymentId" TEXT,
  "externalDonationId" TEXT,
  "fromStudentId" TEXT,
  "toStudentId" TEXT,
  "termLabel" TEXT,
  "givenFor" TEXT,
  "actorUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudentAssignmentAudit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StudentAssignmentAudit_churchId_createdAt_idx" ON "StudentAssignmentAudit"("churchId", "createdAt");
CREATE INDEX IF NOT EXISTS "StudentAssignmentAudit_paymentId_idx" ON "StudentAssignmentAudit"("paymentId");
CREATE INDEX IF NOT EXISTS "StudentAssignmentAudit_externalDonationId_idx" ON "StudentAssignmentAudit"("externalDonationId");
