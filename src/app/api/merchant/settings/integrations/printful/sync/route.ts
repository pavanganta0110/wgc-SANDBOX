import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { syncProducts } from "@/lib/integrations/printful/service";
import { PrintfulApiError, PrintfulConnectionError } from "@/lib/integrations/printful/errors";

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
    // Previously replaced every failure with a generic "try again" message,
    // discarding the actual Printful/PrintfulApiError reason — the same
    // mistake the connect route made before it was fixed to surface real
    // errors. PrintfulApiError.message is already sanitized (never a raw
    // stack trace or arbitrary object dump — see errors.ts/realProvider.ts),
    // so it's safe to return directly.
    const message =
      err instanceof PrintfulApiError || err instanceof PrintfulConnectionError
        ? err.message
        : err?.message || "We could not sync products right now. Please try again.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
