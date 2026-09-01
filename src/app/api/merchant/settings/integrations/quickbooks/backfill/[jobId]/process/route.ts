import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { processQuickBooksBackfillJobChunk } from "@/lib/integrations/quickbooks/backfill";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    requirePermission(auth, "canManageIntegrations");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { jobId } = await params;

  let job;
  try {
    job = await processQuickBooksBackfillJobChunk(jobId, auth.churchId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (job.status === "COMPLETED") {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      action: "quickbooks.backfill_completed",
      entityType: "Payment",
      metadata: { jobId: job.id, succeeded: job.succeededCount, failed: job.failedCount, skipped: job.skippedCount },
      req,
    });
  }

  return NextResponse.json({ job });
}
