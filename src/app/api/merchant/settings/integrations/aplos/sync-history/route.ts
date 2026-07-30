import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Read-only sync history for the merchant's own organization — every
 * authenticated org member can view this (same rule as connection status;
 * only the mutating retry action below requires canManageIntegrations).
 * Never returns aplosContributionId's raw JSON bookkeeping format or any
 * Aplos response content — only the safe, documented fields.
 */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const parsedLimit = parseInt(searchParams.get("limit") || "25", 10);
  const limit = Math.min(100, Math.max(1, Number.isNaN(parsedLimit) ? 25 : parsedLimit));

  const records = await prisma.aplosSyncRecord.findMany({
    where: { churchId: auth.churchId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      settlementId: true,
      status: true,
      attemptCount: true,
      nextAttemptAt: true,
      startedAt: true,
      syncedAt: true,
      lastAttemptAt: true,
      blockedReason: true,
      lastErrorMessage: true,
      requiresManualReview: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ records });
}
