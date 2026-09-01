import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getPrintfulMode, isPrintfulIntegrationEnabled } from "@/lib/integrations/printful/config";
import { getOrCreateSettings } from "@/lib/integrations/printful/service";

/** Read-only status — any authenticated org member can view it (mirrors
 * the Aplos status route's access model); state-changing actions below are
 * gated by canManageIntegrations. */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  if (!isPrintfulIntegrationEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const connection = await prisma.printfulConnection.findUnique({ where: { churchId: auth.churchId } });
  const settings = await getOrCreateSettings(auth.churchId);
  const productCount = await prisma.merchandiseProduct.count({ where: { churchId: auth.churchId, syncStatus: { not: "UNAVAILABLE" } } });

  return NextResponse.json({
    enabled: true,
    mode: getPrintfulMode(),
    connection: connection
      ? {
          status: connection.status,
          connectionType: connection.connectionType,
          storeId: connection.printfulStoreId,
          accountId: connection.printfulAccountId,
          lastConnectedAt: connection.lastConnectedAt,
          lastSyncAt: connection.lastSyncAt,
          lastSyncStatus: connection.lastSyncStatus,
          lastSyncError: connection.lastSyncError,
        }
      : null,
    settings: {
      enabled: settings.enabled,
      showMerchandiseOnGivingPages: settings.showMerchandiseOnGivingPages,
      defaultMarkupType: settings.defaultMarkupType,
      defaultMarkupValue: settings.defaultMarkupValue,
      autoSubmitOrders: settings.autoSubmitOrders,
    },
    productCount,
  });
}
