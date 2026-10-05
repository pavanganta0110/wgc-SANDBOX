import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { processMigrationJobChunk } from "@/lib/migrations/migrationEngine";

/**
 * Client-driven chunk advance — the caller polls this repeatedly while
 * status is READY/IMPORTING, same convention as
 * processBulkReceiptJobChunk and the annual-statements job processor.
 * Deliberately not cron-driven: this project's Vercel plan only allows
 * daily cron jobs, which can't give a wizard step live progress.
 */
export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canManageMigrations");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  let job;
  try {
    job = await processMigrationJobChunk(jobId, auth.churchId, auth.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Migration job not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (job.status === "COMPLETED" || job.status === "COMPLETED_WITH_ERRORS") {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      action: "migration_job.completed",
      entityType: "MigrationJob",
      entityId: job.id,
      metadata: { succeeded: job.succeededRecords, failed: job.failedRecords, total: job.totalRecords },
      req,
    });
  }

  return NextResponse.json({ job });
}
