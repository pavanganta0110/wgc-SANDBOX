import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const result = await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "PossibleDonorMatch" (
          "id" TEXT NOT NULL,
          "churchId" TEXT NOT NULL,
          "existingDonorId" TEXT NOT NULL,
          "candidateDonorId" TEXT NOT NULL,
          "sourceType" TEXT NOT NULL,
          "sourceId" TEXT,
          "confidence" TEXT NOT NULL,
          "confidenceScore" INTEGER NOT NULL,
          "matchedFields" TEXT[],
          "conflictingFields" TEXT[],
          "matchReason" TEXT NOT NULL,
          "donationAmountCents" INTEGER,
          "donationDate" TIMESTAMP(3),
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "reviewedByUserId" TEXT,
          "reviewedByEmail" TEXT,
          "reviewedAt" TIMESTAMP(3),
          "resolutionNote" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,

          CONSTRAINT "PossibleDonorMatch_pkey" PRIMARY KEY ("id")
      );
    `);
    
    // Create indexes
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PossibleDonorMatch_churchId_status_idx" ON "PossibleDonorMatch"("churchId", "status");');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PossibleDonorMatch_existingDonorId_idx" ON "PossibleDonorMatch"("existingDonorId");');
    await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "PossibleDonorMatch_candidateDonorId_idx" ON "PossibleDonorMatch"("candidateDonorId");');

    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}
