import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { isPlanningCenterIntegrationConfigured, isPlanningCenterIntegrationEnabled } from "@/lib/integrations/planningcenter/config";

/** Read-only status — any authenticated org member can view it; state-
 * changing actions are gated by canManageIntegrations in their own routes.
 * Never returns token material. */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!isPlanningCenterIntegrationEnabled()) {
    return NextResponse.json({ enabled: false, configured: false });
  }

  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId: auth.churchId } });

  return NextResponse.json({
    enabled: true,
    configured: isPlanningCenterIntegrationConfigured(),
    connection: connection
      ? {
          status: connection.status,
          organizationName: connection.pcoOrganizationName,
          connectedByName: connection.pcoConnectedUserName,
          connectedAt: connection.connectedAt,
          lastConnectionTestAt: connection.lastConnectionTestAt,
          lastErrorMessage: connection.lastErrorMessage,
          refreshTokenExpiresAt: connection.refreshTokenExpiresAt,
          canReadGiving: connection.canReadGiving,
        }
      : null,
  });
}
