import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { isPlanningCenterIntegrationConfigured, isPlanningCenterIntegrationEnabled } from "./config";
import {
  ACCESS_TOKEN_EXPIRY_BUFFER_MS,
  exchangeAuthorizationCode,
  refreshAccessToken,
  revokeToken,
  type PlanningCenterTokenSet,
} from "./authProvider";
import { decryptPlanningCenterAccessToken, decryptPlanningCenterRefreshToken, encryptPlanningCenterTokens } from "./credentials";
import {
  PlanningCenterApiError,
  PlanningCenterAuthError,
  PlanningCenterConnectionError,
} from "./errors";
import { fetchPlanningCenterIdentity, PlanningCenterClient, probeGivingAccess } from "./resourceClient";

/**
 * The only place that decides how to reach Planning Center for a given
 * church. Routes and cron jobs go through this module rather than touching
 * the PlanningCenterConnection table or the auth/resource modules directly.
 *
 * Unlike QuickBooks (in-memory per-process token cache), refresh here is
 * durable and race-safe: tokens rotate on refresh, so two serverless
 * instances refreshing the same church at once must not lose the new token.
 */

/** Refresh tokens are honored ~90 days; refresh proactively inside this window. */
export const REFRESH_AHEAD_DAYS = 14;

type ConnectionRow = NonNullable<Awaited<ReturnType<typeof prisma.planningCenterConnection.findUnique>>>;

function scopeList(scopes: string): string[] | undefined {
  return scopes ? scopes.split(" ") : undefined;
}

function isAccessTokenFresh(row: Pick<ConnectionRow, "tokenExpiresAt" | "accessTokenEncrypted">): boolean {
  return Boolean(row.accessTokenEncrypted && row.tokenExpiresAt && row.tokenExpiresAt.getTime() - ACCESS_TOKEN_EXPIRY_BUFFER_MS > Date.now());
}

export function isConfigured(): boolean {
  return isPlanningCenterIntegrationEnabled() && isPlanningCenterIntegrationConfigured();
}

export async function getConnectionStatus(churchId: string) {
  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection) return { status: "NOT_CONNECTED" as const, connection: null };
  return { status: connection.status, connection };
}

/**
 * Step 3 of the OAuth flow. Exchanges the code, verifies the resulting token
 * against Planning Center BEFORE persisting anything (never stores an
 * unverified credential), refuses a Planning Center organization already
 * linked to a different WGC church, then upserts the connection.
 */
export async function completePlanningCenterConnection(params: {
  churchId: string;
  code: string;
  codeVerifier: string;
  actorUserId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}) {
  const tokens = await exchangeAuthorizationCode(params.code, params.codeVerifier);
  const client = new PlanningCenterClient({ accessToken: tokens.accessToken });

  const abandon = async (message: string): Promise<never> => {
    // Do not leave a live grant behind for a connection we refused to keep.
    await revokeToken(tokens.refreshToken, "refresh_token");
    throw new PlanningCenterConnectionError(message);
  };

  let identity;
  let canReadGiving: boolean;
  try {
    identity = await fetchPlanningCenterIdentity(client);
    canReadGiving = await probeGivingAccess(client);
  } catch (err) {
    if (err instanceof PlanningCenterApiError) {
      return abandon(
        err.status === 403
          ? "The Planning Center account you used doesn't have access to People. Reconnect with an account that can view people."
          : err.message
      );
    }
    throw err;
  }

  const conflicting = await prisma.planningCenterConnection.findUnique({
    where: { pcoOrganizationId: identity.organizationId },
    select: { churchId: true },
  });
  if (conflicting && conflicting.churchId !== params.churchId) {
    return abandon("This Planning Center organization is already connected to a different WGC organization. Contact WGC support if that's unexpected.");
  }

  const encrypted = encryptPlanningCenterTokens(tokens.accessToken, tokens.refreshToken);
  const data = {
    status: "CONNECTED",
    pcoOrganizationId: identity.organizationId,
    pcoOrganizationName: identity.organizationName,
    pcoConnectedUserId: identity.userId,
    pcoConnectedUserName: identity.userName,
    accessTokenEncrypted: encrypted.accessTokenEncrypted,
    refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
    encryptionKeyFingerprint: encrypted.encryptionKeyFingerprint,
    tokenExpiresAt: tokens.accessTokenExpiresAt,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    scopesJson: scopeList(tokens.scopes),
    canReadPeople: true,
    canReadGiving,
    canWriteGiving: null,
    connectedByUserId: params.actorUserId,
    connectedAt: new Date(),
    disconnectedAt: null,
    lastErrorAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
  };

  let connection;
  try {
    connection = await prisma.planningCenterConnection.upsert({
      where: { churchId: params.churchId },
      create: { churchId: params.churchId, ...data },
      update: data,
    });
  } catch (err) {
    // Lost a race to another church claiming the same Planning Center org.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return abandon("This Planning Center organization is already connected to a different WGC organization. Contact WGC support if that's unexpected.");
    }
    throw err;
  }

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "planningcenter.connection_created",
    entityType: "PlanningCenterConnection",
    entityId: connection.id,
    metadata: { pcoOrganizationId: identity.organizationId, canReadGiving },
    req: params.req,
  });

  return connection;
}

async function persistRefreshedTokens(row: ConnectionRow, tokens: PlanningCenterTokenSet): Promise<boolean> {
  const encrypted = encryptPlanningCenterTokens(tokens.accessToken, tokens.refreshToken);
  // Compare-and-swap on the refresh token we read: if another instance
  // already rotated it, this updates nothing and the caller adopts theirs.
  const result = await prisma.planningCenterConnection.updateMany({
    where: { id: row.id, refreshTokenEncrypted: row.refreshTokenEncrypted },
    data: {
      accessTokenEncrypted: encrypted.accessTokenEncrypted,
      refreshTokenEncrypted: encrypted.refreshTokenEncrypted,
      encryptionKeyFingerprint: encrypted.encryptionKeyFingerprint,
      tokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
      scopesJson: scopeList(tokens.scopes),
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  return result.count === 1;
}

/**
 * Returns a usable access token for the church, refreshing (and persisting
 * the rotated refresh token) when needed. `force` refreshes even if the
 * current access token is still valid (used by the refresh-ahead cron to
 * keep the 90-day refresh window rolling).
 */
export async function getAccessTokenForChurch(churchId: string, options: { force?: boolean } = {}): Promise<string> {
  const row = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!row || !row.accessTokenEncrypted || !row.refreshTokenEncrypted) {
    throw new PlanningCenterConnectionError("This organization has no Planning Center connection on file.");
  }
  if (row.status === "REAUTHENTICATION_REQUIRED" || row.status === "DISCONNECTED" || row.status === "NOT_CONNECTED") {
    throw new PlanningCenterConnectionError("This organization's Planning Center connection needs to be reconnected.");
  }

  if (!options.force && isAccessTokenFresh(row)) {
    return decryptPlanningCenterAccessToken({ accessTokenEncrypted: row.accessTokenEncrypted, encryptionKeyFingerprint: row.encryptionKeyFingerprint });
  }

  const refreshToken = decryptPlanningCenterRefreshToken({ refreshTokenEncrypted: row.refreshTokenEncrypted, encryptionKeyFingerprint: row.encryptionKeyFingerprint });

  // The tokens another instance may have written while we were refreshing.
  const adoptWinner = async (): Promise<string | null> => {
    const latest = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
    if (latest && latest.refreshTokenEncrypted && latest.refreshTokenEncrypted !== row.refreshTokenEncrypted && isAccessTokenFresh(latest) && latest.accessTokenEncrypted) {
      return decryptPlanningCenterAccessToken({ accessTokenEncrypted: latest.accessTokenEncrypted, encryptionKeyFingerprint: latest.encryptionKeyFingerprint });
    }
    return null;
  };

  let tokens: PlanningCenterTokenSet;
  try {
    tokens = await refreshAccessToken(refreshToken);
  } catch (err) {
    if (err instanceof PlanningCenterAuthError && err.normalized.category === "INVALID_GRANT") {
      // Our refresh token was spent. Either another instance just rotated it
      // (use theirs) or the grant is truly dead (church must reconnect).
      const winner = await adoptWinner();
      if (winner) return winner;
      await prisma.planningCenterConnection.updateMany({
        where: { id: row.id, refreshTokenEncrypted: row.refreshTokenEncrypted },
        data: { status: "REAUTHENTICATION_REQUIRED", lastErrorAt: new Date(), lastErrorCode: "INVALID_GRANT", lastErrorMessage: err.normalized.safeMessage },
      });
    }
    throw err;
  }

  const won = await persistRefreshedTokens(row, tokens);
  if (won) return tokens.accessToken;
  const winner = await adoptWinner();
  if (winner) return winner;
  // Lost the swap but the winner's token isn't usable either; ours is valid.
  return tokens.accessToken;
}

export async function getClientForChurch(churchId: string): Promise<PlanningCenterClient> {
  return new PlanningCenterClient({ accessToken: await getAccessTokenForChurch(churchId) });
}

/**
 * Disconnect revokes the grant at Planning Center best-effort, then clears
 * the stored tokens and the organization link so another WGC church could
 * connect that Planning Center organization. Never deletes anything else.
 */
export async function disconnectPlanningCenter(params: { churchId: string; actorUserId: string; actorEmail?: string | null; actorRole?: string | null; req?: Request }) {
  const existing = await prisma.planningCenterConnection.findUnique({ where: { churchId: params.churchId } });
  if (!existing) throw new PlanningCenterConnectionError("This organization has no Planning Center connection.");

  if (existing.refreshTokenEncrypted) {
    try {
      const refreshToken = decryptPlanningCenterRefreshToken({ refreshTokenEncrypted: existing.refreshTokenEncrypted, encryptionKeyFingerprint: existing.encryptionKeyFingerprint });
      await revokeToken(refreshToken, "refresh_token");
    } catch {
      // Key mismatch or a Planning Center outage must never block disconnecting on our side.
    }
  }

  const connection = await prisma.planningCenterConnection.update({
    where: { churchId: params.churchId },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      pcoOrganizationId: null,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    },
  });

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "planningcenter.disconnected",
    entityType: "PlanningCenterConnection",
    entityId: connection.id,
    req: params.req,
  });

  return connection;
}

export async function testExistingPlanningCenterConnection(churchId: string): Promise<{ ok: boolean; message: string }> {
  try {
    const client = await getClientForChurch(churchId);
    const identity = await fetchPlanningCenterIdentity(client);
    const canReadGiving = await probeGivingAccess(client);
    await prisma.planningCenterConnection.updateMany({
      where: { churchId },
      data: {
        status: "CONNECTED",
        lastConnectionTestAt: new Date(),
        pcoOrganizationName: identity.organizationName ?? undefined,
        canReadGiving,
        lastErrorAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    return {
      ok: true,
      message: canReadGiving
        ? "Connection is healthy."
        : "Connected, but the Planning Center user who connected can't access Giving. Reconnect with a finance administrator account.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not verify the Planning Center connection.";
    const needsReauth =
      (err instanceof PlanningCenterAuthError && err.normalized.category === "INVALID_GRANT") ||
      (err instanceof PlanningCenterApiError && err.normalized.category === "AUTHENTICATION_REQUIRED");
    await prisma.planningCenterConnection.updateMany({
      where: { churchId, status: { notIn: ["DISCONNECTED", "NOT_CONNECTED", "REAUTHENTICATION_REQUIRED"] } },
      data: {
        status: needsReauth ? "REAUTHENTICATION_REQUIRED" : "ERROR",
        lastConnectionTestAt: new Date(),
        lastErrorAt: new Date(),
        lastErrorMessage: message,
      },
    });
    return { ok: false, message };
  }
}

/**
 * Cron entry point: refresh every connected church whose refresh token is
 * within REFRESH_AHEAD_DAYS of expiring, so an idle church isn't silently
 * disconnected at the ~90-day limit. Per-church failures are isolated.
 */
export async function refreshExpiringConnections(now: Date = new Date()): Promise<{ checked: number; refreshed: number; failed: number }> {
  const horizon = new Date(now.getTime() + REFRESH_AHEAD_DAYS * 24 * 60 * 60 * 1000);
  const due = await prisma.planningCenterConnection.findMany({
    where: { status: "CONNECTED", refreshTokenExpiresAt: { lte: horizon } },
    select: { churchId: true },
  });

  let refreshed = 0;
  let failed = 0;
  for (const { churchId } of due) {
    try {
      await getAccessTokenForChurch(churchId, { force: true });
      refreshed++;
    } catch (err) {
      failed++;
      console.error(`planning-center refresh failed for church ${churchId}:`, err instanceof Error ? err.message : err);
    }
  }
  return { checked: due.length, refreshed, failed };
}
