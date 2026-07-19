import { NextResponse } from "next/server";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function GET() {
  // Team-access Checkpoint 4B: migrated to requireMerchantSession() —
  // rejects wgc_admin unconditionally before getOrganizationPermissions is
  // ever consulted (that function's own wgc_admin branch is for legitimate
  // getSession()-based internal review elsewhere, not this merchant route).
  // No Finix call or settlement/bank-selection logic touched.
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

  const account = await resolveActiveBankAccount(auth.churchId);
  return NextResponse.json({ account });
}
