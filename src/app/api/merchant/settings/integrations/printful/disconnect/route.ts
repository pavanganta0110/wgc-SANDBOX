import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { disconnectPrintful } from "@/lib/integrations/printful/service";

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

  const connection = await disconnectPrintful({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role });
  return NextResponse.json({ success: true, connection: { status: connection.status } });
}
