import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { testPrintfulConnection } from "@/lib/integrations/printful/service";

export async function POST() {
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

  try {
    const result = await testPrintfulConnection(auth.churchId);
    return NextResponse.json({ success: result.ok, message: result.message, checkedAt: result.checkedAt });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: "Could not reach the merchandise store." }, { status: 200 });
  }
}
