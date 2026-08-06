import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Platform-wide triage list, across every organization, of sync records
 * that need WGC awareness: NEEDS_REVIEW (an ambiguous Aplos POST outcome —
 * frozen, never auto-retried, per docs/integrations/aplos.md section 7) and
 * FAILED (exhausted automatic retries or a non-retryable classified error).
 * Read-only — no action is available here; a NEEDS_REVIEW record can only
 * be resolved by the organization verifying directly in their own Aplos
 * account, and a FAILED one only by the organization's own Retry action.
 * This view exists so WGC support can proactively reach out, not to act on
 * a merchant's behalf.
 */
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const records = await prisma.aplosSyncRecord.findMany({
    where: { status: { in: ["NEEDS_REVIEW", "FAILED"] } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      churchId: true,
      settlementId: true,
      status: true,
      attemptCount: true,
      blockedReason: true,
      lastErrorMessage: true,
      requiresManualReview: true,
      updatedAt: true,
    },
  });

  const churchIds = [...new Set(records.map((r) => r.churchId))];
  const churches = churchIds.length ? await prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true, slug: true } }) : [];
  const churchById = new Map(churches.map((c) => [c.id, c]));

  return NextResponse.json({
    records: records.map((r) => ({ ...r, churchName: churchById.get(r.churchId)?.name ?? "Unknown", churchSlug: churchById.get(r.churchId)?.slug ?? null })),
  });
}
