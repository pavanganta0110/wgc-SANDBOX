import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Temporary, one-time-use endpoint to create the ContactInquiry table on an
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
      CREATE TABLE IF NOT EXISTS "ContactInquiry" (
          "id" TEXT NOT NULL,
          "firstName" TEXT NOT NULL,
          "lastName" TEXT NOT NULL,
          "email" TEXT NOT NULL,
          "company" TEXT,
          "role" TEXT,
          "message" TEXT NOT NULL,
          "emailSent" BOOLEAN NOT NULL DEFAULT false,
          "emailError" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
      );
    `);

    return NextResponse.json({ status: "ok" });
  } catch (err: any) {
    console.error("schema-sync failed:", err);
    return NextResponse.json({ error: String(err?.message || err) }, { status: 500 });
  }
}
