import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { processBulkStatementJobChunk } from "@/lib/donors/bulkStatementJobs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;

  let job;
  try {
    job = await processBulkStatementJobChunk(jobId, session.churchId, session.email);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Job not found" }, { status: 404 });
  }

  if (job.status === "COMPLETED") {
    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
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
