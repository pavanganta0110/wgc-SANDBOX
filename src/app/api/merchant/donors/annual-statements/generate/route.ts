import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { generateYearEndStatement } from "@/lib/donors/generateStatement";

/**
 * Runs bulk generation synchronously within this request rather than a
 * background job queue — this app has no job/queue infrastructure today.
 * Fine for the realistic donor-list sizes here; a genuinely large
 * organization would need a real async worker, which is a real
 * infrastructure gap, not something faked here with a fake "processing…"
 * UI that doesn't actually run in the background.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canGenerateStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const taxYear = parseInt(body.taxYear, 10);
  const donorIds: string[] = Array.isArray(body.donorIds) ? body.donorIds : [];
  if (!taxYear || donorIds.length === 0) {
    return NextResponse.json({ error: "taxYear and donorIds are required" }, { status: 400 });
  }

  let generated = 0;
  let needsReview = 0;
  let failed = 0;

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "statement.bulk_generation_started",
    entityType: "donor",
    metadata: { taxYear, count: donorIds.length },
    req,
  });

  for (const donorId of donorIds) {
    try {
      const result = await generateYearEndStatement(donorId, session.churchId, taxYear, session.userId);
      generated += 1;
      if (result.status === "NEEDS_REVIEW") needsReview += 1;
    } catch (err) {
      failed += 1;
    }
  }

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "statement.bulk_generation_completed",
    entityType: "donor",
    metadata: { taxYear, generated, needsReview, failed },
    req,
  });

  return NextResponse.json({ generated, needsReview, failed });
}
