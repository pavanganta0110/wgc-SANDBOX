import { NextResponse } from "next/server";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { processBulkStatementJobChunk } from "@/lib/donors/bulkStatementJobs";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const { jobId } = await params;

  let job;
  try {
    job = await processBulkStatementJobChunk(jobId, auth.churchId, auth.email);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Job not found" }, { status: 404 });
  }

  if (job.status === "COMPLETED") {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: job.jobType === "GENERATE" ? "statement.bulk_generation_completed" : "statement.bulk_sending_completed",
      entityType: "donor",
      metadata: {
        jobId: job.id,
        succeeded: job.succeededCount,
        failed: job.failedCount,
        needsReview: job.needsReviewCount,
        skipped: job.skippedCount,
      },
      req,
    });
  }

  return NextResponse.json({ job });
}
