import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { isQuickBooksIntegrationConfigured, isQuickBooksIntegrationEnabled } from "@/lib/integrations/quickbooks/config";

/** Read-only status — any authenticated org member can view it, mirroring
 * the Aplos/Printful status routes' access model; state-changing actions
 * are gated by canManageIntegrations in their own routes below. */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!isQuickBooksIntegrationEnabled()) {
    return NextResponse.json({ enabled: false, configured: false });
  }

  const connection = await prisma.quickBooksConnection.findUnique({ where: { churchId: auth.churchId } });

  return NextResponse.json({
    enabled: true,
    configured: isQuickBooksIntegrationConfigured(),
    connection: connection
      ? {
          status: connection.status,
          realmId: connection.realmId,
          companyName: connection.companyName,
          connectedAt: connection.connectedAt,
          lastConnectionTestAt: connection.lastConnectionTestAt,
          lastSyncAt: connection.lastSyncAt,
          lastSyncStatus: connection.lastSyncStatus,
          lastSyncError: connection.lastSyncError,
          lastErrorMessage: connection.lastErrorMessage,
          refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
        }
      : null,
  });
}
