import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Temporary, one-time-use endpoint to create the ComplianceForm table on an
// environment whose DATABASE_URL isn't retrievable outside the deployment
// itself (Vercel redacts it even via API for this account). Gated by
// INTERNAL_SYNC_SECRET, a short-lived env var set only for this operation.
// Deleted (along with the env var) immediately after use — never left
// running as a standing endpoint.
export async function POST(req: Request) {
  const secret = process.env.INTERNAL_SYNC_SECRET;
  const provided = req.headers.get("x-sync-secret");
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ComplianceForm" (
          "id" TEXT NOT NULL,
          "finixComplianceFormId" TEXT NOT NULL,
          "churchId" TEXT NOT NULL,
          "finixMerchantId" TEXT NOT NULL,
          "type" TEXT NOT NULL,
          "version" TEXT,
          "state" TEXT NOT NULL,
          "dueAt" TIMESTAMP(3),
          "validFrom" TIMESTAMP(3),
          "validUntil" TIMESTAMP(3),
          "unsignedFileId" TEXT,
          "signedFileId" TEXT,
          "signeeName" TEXT,
          "signeeTitle" TEXT,
          "signeeIpAddress" TEXT,
          "signeeUserAgent" TEXT,
          "signedAt" TIMESTAMP(3),
          "isAccepted" BOOLEAN NOT NULL DEFAULT false,
          "createdAtFinix" TIMESTAMP(3),
          "updatedAtFinix" TIMESTAMP(3),
          "lastReconciledAt" TIMESTAMP(3),
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "ComplianceForm_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "ComplianceForm_finixComplianceFormId_key" ON "ComplianceForm"("finixComplianceFormId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ComplianceForm_churchId_idx" ON "ComplianceForm"("churchId");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "ComplianceForm_state_idx" ON "ComplianceForm"("state");
    `);
    await prisma.$executeRawUnsafe(`
      DO $$ BEGIN
        ALTER TABLE "ComplianceForm" ADD CONSTRAINT "ComplianceForm_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("schema-sync failed:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
