import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

/**
 * Read-only connection status — any authenticated org member may view it
 * (no canManageIntegrations gate), matching the approved spec: "A viewer
 * may later see safe read-only status through an existing view permission,
 * but may not access credentials or perform Test Connection." Only
 * requireMerchantSession() (i.e. "is a member of this church") gates this
 * route for now.
 *
 * Never returns encryptedPrivateKey — selected explicitly, not via a
 * blanket findUnique, so a future column addition to AplosConnection can
 * never accidentally leak here.
 */
export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const connection = await prisma.aplosConnection.findUnique({
    where: { churchId: auth.churchId },
    select: {
      status: true,
      automaticSyncEnabled: true,
      aplosOrganizationId: true,
      aplosOrganizationName: true,
      privateKeyFingerprint: true,
      connectedAt: true,
      lastConnectionTestAt: true,
      lastSuccessfulSyncAt: true,
      lastErrorAt: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      disconnectedAt: true,
    },
  });

  if (!connection) {
    return NextResponse.json({ status: "NOT_CONNECTED" });
  }

  // Mask the fingerprint further for display — the stored value is already
  // a one-way SHA-256 fingerprint (never the key), this only shortens what
  // reaches the browser for a "...a1b2c3d4"-style display.
  const maskedFingerprint = connection.privateKeyFingerprint
    ? `...${connection.privateKeyFingerprint.slice(-8)}`
    : null;

  return NextResponse.json({
    status: connection.status,
    automaticSyncEnabled: connection.automaticSyncEnabled,
    aplosOrganizationId: connection.aplosOrganizationId,
    aplosOrganizationName: connection.aplosOrganizationName,
    keyFingerprint: maskedFingerprint,
    connectedAt: connection.connectedAt,
    lastConnectionTestAt: connection.lastConnectionTestAt,
    lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt,
    lastErrorAt: connection.lastErrorAt,
    lastErrorCode: connection.lastErrorCode,
    lastErrorMessage: connection.lastErrorMessage,
    disconnectedAt: connection.disconnectedAt,
  });
}
