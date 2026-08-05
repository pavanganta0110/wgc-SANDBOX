import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { processBulkReceiptJobChunk } from "@/lib/donations/bulkReceiptJobs";

export async function POST(req: Request, { params }: { params: Promise<{ jobId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canSendExternalDonationReceipt");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { jobId } = await params;

  let job;
  try {
    job = await processBulkReceiptJobChunk(jobId, auth.churchId, auth.userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Job not found";
    return NextResponse.json({ error: message }, { status: 404 });
  }

  if (job.status === "COMPLETED") {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      action: "external_donation.bulk_receipt_sending_completed",
      entityType: "ExternalDonation",
      metadata: { jobId: job.id, succeeded: job.succeededCount, failed: job.failedCount, skipped: job.skippedCount },
      req,
    });
  }

  return NextResponse.json({ job });
}
