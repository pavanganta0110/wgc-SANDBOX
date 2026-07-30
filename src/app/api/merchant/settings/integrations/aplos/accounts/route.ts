import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { fetchChurchAccounts } from "@/lib/integrations/aplos/resourceService";

/**
 * Read-only Aplos account list for the deposit/expense-account
 * configuration step. Optional ?type=deposit|expense filters to eligible
 * accounts (see accounts.ts's isDepositAccountEligible /
 * isProcessingFeeExpenseAccountEligible) — an invalid/unrecognized value
 * is ignored, returning every enabled account unfiltered rather than
 * erroring, since this is a display convenience, not a security boundary
 * (the real revalidation happens server-side again at save time — see
 * resourceService.ts's revalidateAccountSelection).
 */
export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const filter = typeParam === "deposit" || typeParam === "expense" ? typeParam : undefined;

  const result = await fetchChurchAccounts(auth.churchId, filter);
  if (!result.success) {
    return NextResponse.json({ error: result.normalized.safeMessage, category: result.normalized.category }, { status: 502 });
  }

  return NextResponse.json({
    accounts: result.data.map((a) => ({
      accountNumber: a.account_number,
      name: a.name,
      category: a.category,
      isEnabled: a.is_enabled,
      type: a.type,
    })),
  });
}
