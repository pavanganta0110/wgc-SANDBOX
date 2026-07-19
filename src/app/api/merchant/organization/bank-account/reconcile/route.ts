import { NextResponse } from "next/server";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { reconcilePendingPayoutAccountsForChurch } from "@/lib/organization/payoutAccountReconciliation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/**
 * On-demand reconciliation fallback — webhooks are the primary update
 * mechanism (see the PAYMENT_INSTRUMENT block in the Finix webhook
 * handler). This route lets the pending-status UI trigger a fresh check
 * without waiting for a webhook, and gives WGC support a manual fallback.
 * Not wired to an automatic schedule in this codebase (no cron/queue
 * infrastructure exists here yet) — see the completion report.
 */
export async function POST() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconcilePendingPayoutAccountsForChurch(auth.churchId);
  return NextResponse.json({ results });
}
