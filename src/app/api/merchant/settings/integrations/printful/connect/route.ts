import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { connectMockPrintful, connectPrintfulWithPrivateToken } from "@/lib/integrations/printful/service";
import { getPrintfulMode } from "@/lib/integrations/printful/config";
import { PrintfulConnectionError } from "@/lib/integrations/printful/errors";

/**
 * Two paths, both gated by PRINTFUL_MODE:
 * - PRINTFUL_MODE=mock (default, sandbox demos): "Connect Printful"
 *   creates/reuses a mock connection with zero external calls — spec item
 *   25. Ignores any privateToken in the body.
 * - PRINTFUL_MODE=live: requires a privateToken in the body (Printful
 *   Store Private API Token) — validated against Printful's real API
 *   before ever being stored. A future OAuth redirect flow would add a
 *   third branch here without touching the mock path.
 */
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

  if (getPrintfulMode() !== "mock") {
    let body: { privateToken?: string } = {};
    try {
      body = await req.json();
    } catch {
      // no body — fall through to the missing-token error below
    }
    if (!body.privateToken) {
      return NextResponse.json({ error: "A Printful API token is required to connect." }, { status: 400 });
    }

    try {
      const connection = await connectPrintfulWithPrivateToken({
        churchId: auth.churchId,
        privateToken: body.privateToken,
        actorUserId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        req,
      });
      return NextResponse.json({ success: true, connection: { status: connection.status, connectionType: connection.connectionType, storeId: connection.printfulStoreId } });
    } catch (err) {
      if (err instanceof PrintfulConnectionError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }
  }

  const connection = await connectMockPrintful({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role });
  return NextResponse.json({ success: true, connection: { status: connection.status, connectionType: connection.connectionType, storeId: connection.printfulStoreId } });
}
