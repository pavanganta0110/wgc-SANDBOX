import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { syncProducts } from "@/lib/integrations/printful/service";

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

  try {
    const result = await syncProducts({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role, syncType: "MANUAL", req });
    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    console.error("Printful sync route failed:", err);
    return NextResponse.json({ success: false, error: "We could not sync products right now. Please try again." }, { status: 502 });
  }
}
