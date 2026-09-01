import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { prisma } from "@/lib/prisma";
import { createQuickBooksBackfillJob } from "@/lib/integrations/quickbooks/backfill";

export async function POST(req: Request) {
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

  const connection = await prisma.quickBooksConnection.findUnique({ where: { churchId: auth.churchId } });
  if (!connection || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Connect QuickBooks before syncing past transactions." }, { status: 400 });
  }

  const job = await createQuickBooksBackfillJob(auth.churchId, auth.userId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "quickbooks.backfill_started",
    entityType: "Payment",
    metadata: { count: job.totalCount, jobId: job.id },
    req,
  });

  return NextResponse.json({ job });
}
