import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createBulkStatementJob } from "@/lib/donors/bulkStatementJobs";

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const taxYear = parseInt(body.taxYear, 10);
  const jobType = body.jobType === "SEND" ? "SEND" : body.jobType === "GENERATE" ? "GENERATE" : null;
  const targetIds: string[] = Array.isArray(body.targetIds) ? [...new Set<string>(body.targetIds)] : [];

  if (!taxYear || !jobType || targetIds.length === 0) {
    return NextResponse.json({ error: "taxYear, jobType, and targetIds are required" }, { status: 400 });
  }
  if (jobType === "GENERATE" && !permissions.canGenerateStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (jobType === "SEND" && !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await createBulkStatementJob(session.churchId, taxYear, jobType, targetIds, session.userId);

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: jobType === "GENERATE" ? "statement.bulk_generation_started" : "statement.bulk_sending_started",
    entityType: "donor",
    metadata: { taxYear, count: targetIds.length, jobId: job.id },
    req,
  });

  return NextResponse.json({ job });
}
