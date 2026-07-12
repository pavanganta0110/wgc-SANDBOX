import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { reconcilePendingPayoutAccountsForChurch } from "@/lib/organization/payoutAccountReconciliation";

/**
 * On-demand reconciliation fallback — webhooks are the primary update
 * mechanism (see the PAYMENT_INSTRUMENT block in the Finix webhook
 * handler). This route lets the pending-status UI trigger a fresh check
 * without waiting for a webhook, and gives WGC support a manual fallback.
 * Not wired to an automatic schedule in this codebase (no cron/queue
 * infrastructure exists here yet) — see the completion report.
 */
export async function POST() {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconcilePendingPayoutAccountsForChurch(session.churchId);
  return NextResponse.json({ results });
}
