import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createBulkReceiptJob } from "@/lib/donations/bulkReceiptJobs";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canSendExternalDonationReceipt");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const job = await createBulkReceiptJob(auth.churchId, auth.userId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "external_donation.bulk_receipt_sending_started",
    entityType: "ExternalDonation",
    metadata: { count: job.totalCount, jobId: job.id },
    req,
  });

  return NextResponse.json({ job });
}
