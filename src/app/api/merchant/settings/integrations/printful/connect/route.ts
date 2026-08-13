import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { connectMockPrintful } from "@/lib/integrations/printful/service";
import { getPrintfulMode } from "@/lib/integrations/printful/config";

/**
 * In mock mode (the only mode this sandbox runs in today), "Connect
 * Printful" creates/reuses a mock connection with zero external calls —
 * spec item 25. When real credentials eventually arrive, this route is
 * where the OAuth redirect/private-token exchange would be added; the mock
 * path stays in place as a fallback for local demos and tests.
 */
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

  if (getPrintfulMode() !== "mock") {
    return NextResponse.json({ error: "Real Printful OAuth connection is not available in this environment yet. Set PRINTFUL_MODE=mock to use the sandbox connection." }, { status: 400 });
  }

  const connection = await connectMockPrintful({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role });
  return NextResponse.json({ success: true, connection: { status: connection.status, connectionType: connection.connectionType, storeId: connection.printfulStoreId } });
}
