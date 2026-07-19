import { NextResponse } from "next/server";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createBulkStatementJob } from "@/lib/donors/bulkStatementJobs";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);

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

  const job = await createBulkStatementJob(auth.churchId, taxYear, jobType, targetIds, auth.userId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: jobType === "GENERATE" ? "statement.bulk_generation_started" : "statement.bulk_sending_started",
    entityType: "donor",
    metadata: { taxYear, count: targetIds.length, jobId: job.id },
    req,
  });

  return NextResponse.json({ job });
}
