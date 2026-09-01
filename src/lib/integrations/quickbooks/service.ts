import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import {
  getQuickBooksEndpoints,
  getQuickBooksOAuthConfig,
  isQuickBooksIntegrationConfigured,
  isQuickBooksIntegrationEnabled,
} from "./config";
import { exchangeAuthorizationCode, OAuthQuickBooksAuthProvider, type QuickBooksTokenSet } from "./authProvider";
import { QuickBooksResourceClient, testQuickBooksConnection } from "./resourceClient";
import { decryptQuickBooksAccessToken, decryptQuickBooksRefreshToken, encryptQuickBooksTokens } from "./credentials";
import { getActiveEncryptionKeyFingerprint } from "./encryption";
import { QuickBooksConnectionError } from "./errors";
import crypto from "crypto";

/**
 * The only place that decides how to reach QuickBooks for a given church —
 * mirrors src/lib/integrations/printful/service.ts's getProviderForChurch.
 * Every route/UI action goes through this module rather than touching
 * Prisma's QuickBooksConnection table or the auth/resource-client modules
 * directly.
 */

/** In-memory per-process OAuth token cache/refresher — same lifetime
 * caveats as ManualCredentialAuthProvider in aplos/authProvider.ts (no
 * durable cross-instance cache; correctness holds per-process, not across
 * a serverless fleet). */
const authProvider = new OAuthQuickBooksAuthProvider(
  async (churchId) => {
    const connection = await prisma.quickBooksConnection.findUnique({ where: { churchId } });
    if (!connection || !connection.realmId || !connection.accessTokenEncrypted || !connection.refreshTokenEncrypted) {
      throw new QuickBooksConnectionError("This organization has no QuickBooks connection on file.");
    }
    return {
      realmId: connection.realmId,
      accessToken: decryptQuickBooksAccessToken({ accessTokenEncrypted: connection.accessTokenEncrypted, encryptionKeyFingerprint: connection.encryptionKeyFingerprint }),
      refreshToken: decryptQuickBooksRefreshToken({ refreshTokenEncrypted: connection.refreshTokenEncrypted, encryptionKeyFingerprint: connection.encryptionKeyFingerprint }),
      accessTokenExpiresAt: connection.tokenExpiresAt ?? new Date(0),
    };
  },
  async (churchId, tokens) => {
    await persistTokens(churchId, tokens);
  }
);

async function persistTokens(churchId: string, tokens: QuickBooksTokenSet): Promise<void> {
  const encrypted = encryptQuickBooksTokens(tokens.accessToken, tokens.refreshToken);
  await prisma.quickBooksConnection.update({
    where: { churchId },
    data: {
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
      encryptionKeyFingerprint: encrypted.encryptionKeyFingerprint,
      tokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopesJson: tokens.scopes ? tokens.scopes.split(" ") : undefined,
    },
  });
}

export async function getConnectionStatus(churchId: string) {
  const connection = await prisma.quickBooksConnection.findUnique({ where: { churchId } });
  if (!connection) return { status: "NOT_CONNECTED" as const, connection: null };
  return { status: connection.status, connection };
}

/**
 * Builds the Intuit authorize-redirect URL for step 1 of the OAuth flow.
 * `state` must be a CSRF token the caller generated and will verify on
 * callback (see the connect/route.ts GET handler) — this function is pure
 * URL-building, it does not persist or validate state itself.
 */
export async function buildAuthorizeUrl(state: string): Promise<string> {
  const { clientId, redirectUri, scopes } = getQuickBooksOAuthConfig();
  const { authorizeUrl } = await getQuickBooksEndpoints();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    access_type: "offline",
  });
  return `${authorizeUrl}?${params.toString()}`;
}

/** Generates a signed-enough one-time CSRF token for the OAuth `state`
 * param — a plain random value is sufficient here since it is only ever
 * compared byte-for-byte against what this same server issued (no
 * cross-service verification needed), matching the pattern already used
 * elsewhere in this codebase for one-time tokens (see
 * BillingActivationToken's tokenHash comment). */
export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Step 3 of the OAuth flow — called from the callback route once Intuit
 * has redirected back with `code` and `realmId`. Exchanges the code for
 * tokens, verifies them with a real API call (never persists an unverified
 * credential, matching connectPrintfulWithPrivateToken's rule), then
 * stores the connection.
 */
export async function completeQuickBooksConnection(params: {
  churchId: string;
  code: string;
  realmId: string;
  actorUserId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}) {
  const tokens = await exchangeAuthorizationCode(params.code);

  const testResult = await testQuickBooksConnection({ accessToken: tokens.accessToken, realmId: params.realmId });
  if (!testResult.ok) {
    throw new QuickBooksConnectionError(testResult.message);
  }

  const encrypted = encryptQuickBooksTokens(tokens.accessToken, tokens.refreshToken);
  const connection = await prisma.quickBooksConnection.upsert({
    where: { churchId: params.churchId },
    create: {
      churchId: params.churchId,
      status: "CONNECTED",
      connectionType: "oauth",
      realmId: params.realmId,
      companyName: testResult.companyName ?? null,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
      encryptionKeyFingerprint: encrypted.encryptionKeyFingerprint,
      tokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopesJson: tokens.scopes ? tokens.scopes.split(" ") : undefined,
      connectedByUserId: params.actorUserId,
      connectedAt: new Date(),
    },
    update: {
      status: "CONNECTED",
      connectionType: "oauth",
      realmId: params.realmId,
      companyName: testResult.companyName ?? null,
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
      encryptionKeyFingerprint: encrypted.encryptionKeyFingerprint,
      tokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopesJson: tokens.scopes ? tokens.scopes.split(" ") : undefined,
      disconnectedAt: null,
      connectedByUserId: params.actorUserId,
      connectedAt: new Date(),
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });

  authProvider.invalidate(params.churchId);

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "quickbooks.connection_created",
    entityType: "QuickBooksConnection",
    entityId: connection.id,
    metadata: { realmId: params.realmId },
    req: params.req,
  });

  return connection;
}

/**
 * Disconnecting must NOT delete any QuickBooksSyncRecord history — it only
 * flips status, clears the stored token pair, and invalidates the
 * in-memory cache so no further API calls are attempted with a token this
 * organization no longer controls.
 */
export async function disconnectQuickBooks(params: { churchId: string; actorUserId: string; actorEmail?: string | null; actorRole?: string | null; req?: Request }) {
  const connection = await prisma.quickBooksConnection.update({
    where: { churchId: params.churchId },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });

  authProvider.invalidate(params.churchId);

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "quickbooks.disconnected",
    entityType: "QuickBooksConnection",
    entityId: connection.id,
    req: params.req,
  });

  return connection;
}

export async function testExistingQuickBooksConnection(churchId: string) {
  try {
    const { token, realmId } = await authProvider.getAccessToken(churchId);
    const result = await testQuickBooksConnection({ accessToken: token, realmId });
    await prisma.quickBooksConnection.updateMany({
      where: { churchId },
      data: {
        status: result.ok ? "CONNECTED" : "ERROR",
        lastConnectionTestAt: new Date(),
        lastErrorAt: result.ok ? undefined : new Date(),
        lastErrorMessage: result.ok ? null : result.message,
        companyName: result.ok ? result.companyName : undefined,
      },
    });
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not verify the QuickBooks connection.";
    await prisma.quickBooksConnection.updateMany({
      where: { churchId },
      data: { status: "ERROR", lastConnectionTestAt: new Date(), lastErrorAt: new Date(), lastErrorMessage: message },
    });
    return { ok: false, message };
  }
}

/** Returns a resource client authenticated for this church — the only
 * function future sync/mapping code should call to reach the QuickBooks
 * Accounting API, so token refresh/caching stays centralized. */
export async function getResourceClientForChurch(churchId: string): Promise<QuickBooksResourceClient> {
  const { token, realmId } = await authProvider.getAccessToken(churchId);
  return new QuickBooksResourceClient({ accessToken: token, realmId });
}

export function isConfigured(): boolean {
  return isQuickBooksIntegrationEnabled() && isQuickBooksIntegrationConfigured();
}
