import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAuthorizations } from "@/lib/finix/sync/syncAuthorizations";
import { getAuthorizationPermissions } from "@/lib/finix/authorizationPermissions";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getAuthorizationPermissions(auth.rawRole);
  if (!permissions.canTriggerSync) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Sync mutates organization-wide Finix data — never available while
    // viewing another user's scope, same rule as bank-account/billing.
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });
  if (!church?.finixMerchantId) {
    return NextResponse.json({ error: "No Finix merchant configured for this church" }, { status: 400 });
  }

  try {
    const result = await syncAuthorizations(church.finixMerchantId, church.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("Authorization sync failed:", error);
    return NextResponse.json({ error: error?.message ?? "Sync failed" }, { status: 500 });
  }
}
