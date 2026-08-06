import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Read-only WGC support view of one organization's Aplos integration —
 * connection status plus recent sync history. No mutating action exists
 * here (no retry, no disconnect) — this mirrors the "financial actions and
 * payment routing changes are disabled" rule already enforced across every
 * other admin merchant-detail tab, since a retry can result in a real
 * financial POST to the organization's own Aplos account.
 */
export async function GET(_req: Request, context: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { churchId } = await context.params;

  const connection = await prisma.aplosConnection.findUnique({
    where: { churchId },
    select: {
      status: true,
      automaticSyncEnabled: true,
      aplosOrganizationId: true,
      aplosOrganizationName: true,
      connectedAt: true,
      lastConnectionTestAt: true,
      lastSuccessfulSyncAt: true,
      lastErrorAt: true,
      lastErrorMessage: true,
      disconnectedAt: true,
    },
  });

  const records = await prisma.aplosSyncRecord.findMany({
    where: { churchId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      settlementId: true,
      status: true,
      attemptCount: true,
      nextAttemptAt: true,
      syncedAt: true,
      lastAttemptAt: true,
      blockedReason: true,
      lastErrorMessage: true,
      requiresManualReview: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ connection, records });
}
