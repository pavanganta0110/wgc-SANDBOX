import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getPrintfulMode } from "./config";
import { MockPrintfulProvider } from "./mockProvider";
import { PrintfulProvider } from "./realProvider";
import type { PrintProvider } from "./provider";
import { mapProductToUpsertData, mapVariantToUpsertData } from "./mapper";
import { decryptSecret, deserializeEnvelope, encryptSecret, serializeEnvelope, getActiveEncryptionKeyFingerprint } from "./encryption";
import { PrintfulConnectionError } from "./errors";

/**
 * The only place that decides mock vs real. Every API route and UI-facing
 * function goes through here rather than instantiating an adapter
 * directly, so the moment a church's connection is upgraded to real
 * credentials (or PRINTFUL_MODE flips to "live"), the rest of the app
 * needs zero changes (spec item 72).
 */
export async function getProviderForChurch(churchId: string): Promise<PrintProvider> {
  const connection = await prisma.printfulConnection.findUnique({ where: { churchId } });

  const globalMode = getPrintfulMode();
  const connectionType = connection?.connectionType ?? "mock";

  if (globalMode === "mock" || connectionType === "mock" || !connection) {
    return new MockPrintfulProvider(churchId);
  }

  if (!connection.accessTokenEncrypted) {
    throw new PrintfulConnectionError("This organization's Printful connection is missing credentials.");
  }
  const accessToken = decryptSecret(deserializeEnvelope(connection.accessTokenEncrypted));
  return new PrintfulProvider({ accessToken, storeId: connection.printfulStoreId });
}

/**
 * Strips characters that cannot legally appear in an HTTP header value from
 * a pasted API token.
 *
 * Copying a token out of a browser or a document routinely drags along
 * invisible characters — most commonly U+FEFF (a zero-width no-break
 * space/BOM), but also zero-width spaces/joiners and stray newlines. These
 * are impossible to see in a password field, yet fetch() rejects the whole
 * request before it leaves the server ("Cannot convert argument to a
 * ByteString because the character at index N has a value of 65279 which is
 * greater than 255"), which reads like a network or permissions failure and
 * sends everyone hunting in the wrong place. Confirmed happening against a
 * real merchant's token. Note String.prototype.trim() does not save us
 * here: it removes U+FEFF only at the ends, never in the middle.
 */
export function sanitizeApiToken(raw: string): string {
  return raw
    .replace(/[​-‍﻿]/g, "") // zero-width space/joiner family + BOM
    .replace(/\s+/g, "") // newlines/tabs/spaces — never valid inside a token
    .trim();
}

/**
 * A non-revealing description of a credential, for error messages.
 *
 * When Printful rejects a token there is no way to tell from the outside
 * whether the right value was pasted, a truncated one, or an entire chunk
 * of surrounding page text — and the field is masked, so the merchant
 * cannot see it either. Reporting the length plus first/last few characters
 * makes that immediately obvious while never putting the secret itself into
 * a toast, a log, or a support ticket.
 */
export function describeToken(token: string): string {
  if (token.length <= 8) return `${token.length} characters`;
  return `${token.length} characters, starts "${token.slice(0, 4)}", ends "${token.slice(-4)}"`;
}

/** Rejects anything still outside printable ASCII after sanitizing, so a
 * genuinely malformed token fails with an explanation instead of an opaque
 * ByteString error from deep inside fetch(). */
export function assertHeaderSafeToken(token: string): void {
  const offending = [...token].findIndex((ch) => ch.charCodeAt(0) < 0x21 || ch.charCodeAt(0) > 0x7e);
  if (offending !== -1) {
    throw new PrintfulConnectionError(
      `This token contains a character that can't be sent to Printful (position ${offending + 1}). Copy the token again directly from Printful — avoid retyping it or copying from a formatted document.`
    );
  }
}

export async function getOrCreateSettings(churchId: string) {
  const existing = await prisma.merchandiseSettings.findUnique({ where: { churchId } });
  if (existing) return existing;
  return prisma.merchandiseSettings.create({ data: { churchId } });
}

export async function getConnectionStatus(churchId: string) {
  const connection = await prisma.printfulConnection.findUnique({ where: { churchId } });
  if (!connection) return { status: "NOT_CONNECTED" as const, connection: null };
  return { status: connection.status, connection };
}

/**
 * In mock mode this is the entire "Connect Printful" action — no OAuth
 * redirect, no external call, just a local row marking the church as
 * connected to the sandbox mock store (spec item 25). A real OAuth/token
 * connect flow would populate accessTokenEncrypted/refreshTokenEncrypted
 * here instead of leaving them null, and set connectionType accordingly.
 */
export async function connectMockPrintful(params: { churchId: string; actorUserId: string; actorEmail?: string | null; actorRole?: string | null; req?: Request }) {
  const connection = await prisma.printfulConnection.upsert({
    where: { churchId: params.churchId },
    create: {
      churchId: params.churchId,
      status: "CONNECTED",
      connectionType: "mock",
      printfulStoreId: `mock-store-${params.churchId.slice(0, 8)}`,
      printfulAccountId: `mock-account-${params.churchId.slice(0, 8)}`,
      connectedByUserId: params.actorUserId,
      lastConnectedAt: new Date(),
    },
    update: {
      status: "CONNECTED",
      connectionType: "mock",
      disconnectedAt: null,
      connectedByUserId: params.actorUserId,
      lastConnectedAt: new Date(),
    },
  });

  await getOrCreateSettings(params.churchId);

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "printful.connection_created",
    entityType: "PrintfulConnection",
    entityId: connection.id,
    metadata: { connectionType: "mock" },
    req: params.req,
  });

  return connection;
}

/**
 * Real connection path — a merchant pastes in their Printful Store Private
 * API Token (Printful account -> Settings -> Stores -> API). Validates the
 * token against Printful's real API BEFORE ever storing it (never persist
 * an unverified credential), then encrypts it the same way Aplos tokens are
 * encrypted. Only usable when PRINTFUL_MODE=live — same env-gated pattern
 * as the mock path is gated to PRINTFUL_MODE=mock in the connect route.
 */
export async function connectPrintfulWithPrivateToken(params: {
  churchId: string;
  privateToken: string;
  // Printful requires an explicit X-PF-Store-Id header on every
  // store-scoped call ("This endpoint requires `store_id`!") even for a
  // token generated against a single authorized store — that requirement
  // is Printful's, not ours, so it cannot be skipped. It can, however, be
  // discovered rather than demanded: left blank, we ask Printful for it
  // (see PrintfulProvider.discoverStoreId) and only fall back to asking
  // the merchant if that fails. Printful's own dashboard does not reliably
  // surface this number anywhere, so never make it the first thing a
  // merchant has to go hunting for.
  storeId?: string | null;
  actorUserId: string;
  actorEmail?: string | null;
  actorRole?: string | null;
  req?: Request;
}) {
  const token = sanitizeApiToken(params.privateToken);
  if (!token) {
    throw new PrintfulConnectionError("A Printful API token is required.");
  }
  assertHeaderSafeToken(token);
  // Same invisible-character hazard as the token — this is pasted too.
  let storeId = sanitizeApiToken(params.storeId ?? "");
  if (!storeId) {
    // Ask Printful rather than the merchant — see the storeId param's
    // comment above for why this is the default path, not a fallback.
    const discovery = await new PrintfulProvider({ accessToken: token }).discoverStoreId();
    if (!discovery.storeId) {
      // Surface exactly what Printful said to each attempt — without this
      // a blocked merchant has nothing actionable to take to Printful
      // support, which is the only remaining way to obtain the number.
      throw new PrintfulConnectionError(
        `Printful would not identify this token's store. Token sent: ${describeToken(token)}. Printful's replies: ${discovery.attempts.join(" | ")}`
      );
    }
    storeId = discovery.storeId;
  }

  const provider = new PrintfulProvider({ accessToken: token, storeId });
  const testResult = await provider.testConnection();
  if (!testResult.ok) {
    throw new PrintfulConnectionError(`${testResult.message} (Token sent: ${describeToken(token)}.)`);
  }
  const connectionInfo = await provider.getConnectionInfo();

  const envelope = encryptSecret(token);
  const connection = await prisma.printfulConnection.upsert({
    where: { churchId: params.churchId },
    create: {
      churchId: params.churchId,
      status: "CONNECTED",
      connectionType: "private_token",
      printfulStoreId: connectionInfo.storeId ?? storeId,
      printfulAccountId: connectionInfo.accountId,
      accessTokenEncrypted: serializeEnvelope(envelope),
      encryptionKeyFingerprint: getActiveEncryptionKeyFingerprint(),
      connectedByUserId: params.actorUserId,
      lastConnectedAt: new Date(),
    },
    update: {
      status: "CONNECTED",
      connectionType: "private_token",
      printfulStoreId: connectionInfo.storeId ?? storeId,
      printfulAccountId: connectionInfo.accountId,
      accessTokenEncrypted: serializeEnvelope(envelope),
      encryptionKeyFingerprint: getActiveEncryptionKeyFingerprint(),
      disconnectedAt: null,
      connectedByUserId: params.actorUserId,
      lastConnectedAt: new Date(),
    },
  });

  await getOrCreateSettings(params.churchId);

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "printful.connection_created",
    entityType: "PrintfulConnection",
    entityId: connection.id,
    metadata: { connectionType: "private_token" },
    req: params.req,
  });

  return connection;
}

/**
 * Disconnecting must NOT delete orders, donor history, or reporting (spec
 * item 58) — it only flips status and stops new products from being
 * orderable. Historical MerchandiseOrder/MerchandiseOrderItem rows and
 * synced MerchandiseProduct rows are left completely intact.
 */
export async function disconnectPrintful(params: { churchId: string; actorUserId: string; actorEmail?: string | null; actorRole?: string | null; req?: Request }) {
  const connection = await prisma.printfulConnection.update({
    where: { churchId: params.churchId },
    data: { status: "DISCONNECTED", disconnectedAt: new Date() },
  });

  // Existing synced products become unavailable for NEW orders, but stay
  // in the table (visibleOnGivingPage is left as-is on purpose — the
  // giving-page render layer checks connection status independently so a
  // disconnected church's page never silently keeps selling merch it can
  // no longer fulfill).
  await prisma.merchandiseProduct.updateMany({
    where: { churchId: params.churchId },
    data: { syncStatus: "UNAVAILABLE" },
  });

  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    action: "printful.disconnected",
    entityType: "PrintfulConnection",
    entityId: connection.id,
    req: params.req,
  });

  return connection;
}

export async function testPrintfulConnection(churchId: string) {
  const provider = await getProviderForChurch(churchId);
  const result = await provider.testConnection();
  await prisma.printfulConnection.updateMany({
    where: { churchId },
    data: { status: result.ok ? "CONNECTED" : "ERROR" },
  });
  return result;
}

/**
 * Upsert sync — fetches the provider's product/variant list and merges it
 * into WGC's own tables (spec item 53). Never deletes a product just
 * because it disappeared from the provider response; missing products are
 * marked UNAVAILABLE so historical orders/reporting referencing them stay
 * intact.
 */
export async function syncProducts(params: { churchId: string; actorUserId?: string | null; actorEmail?: string | null; actorRole?: string | null; syncType?: string; req?: Request }) {
  const churchId = params.churchId;
  const connection = await prisma.printfulConnection.findUnique({ where: { churchId } });

  const log = await prisma.merchandiseSyncLog.create({
    data: { churchId, connectionId: connection?.id ?? null, syncType: params.syncType ?? "MANUAL", status: "RUNNING" },
  });

  let created = 0;
  let updated = 0;
  let failed = 0;
  let received = 0;

  try {
    const provider = await getProviderForChurch(churchId);
    const products = await provider.getProducts();
    received = products.length;
    const seenExternalIds = new Set<string>();

    for (const product of products) {
      try {
        seenExternalIds.add(product.externalProductId);
        const existingProduct = await prisma.merchandiseProduct.findUnique({
          where: { churchId_provider_externalProductId: { churchId, provider: "PRINTFUL", externalProductId: product.externalProductId } },
        });

        const productRow = await prisma.merchandiseProduct.upsert({
          where: { churchId_provider_externalProductId: { churchId, provider: "PRINTFUL", externalProductId: product.externalProductId } },
          create: { ...mapProductToUpsertData(product, churchId), printfulConnectionId: connection?.id ?? null, visibleOnGivingPage: false },
          update: mapProductToUpsertData(product, churchId),
        });
        if (existingProduct) updated++;
        else created++;

        for (const variant of product.variants) {
          const existingVariant = await prisma.merchandiseVariant.findUnique({
            where: { churchId_productId_externalVariantId: { churchId, productId: productRow.id, externalVariantId: variant.externalVariantId } },
          });
          await prisma.merchandiseVariant.upsert({
            where: { churchId_productId_externalVariantId: { churchId, productId: productRow.id, externalVariantId: variant.externalVariantId } },
            create: { ...mapVariantToUpsertData(variant, churchId), productId: productRow.id },
            update: mapVariantToUpsertData(variant, churchId, existingVariant?.merchantPrice),
          });
        }
      } catch (err) {
        console.error(`Printful sync: failed to upsert product ${product.externalProductId}:`, err);
        failed++;
      }
    }

    // Mark products that used to sync from this provider but no longer
    // appear — never deleted (spec item 53).
    await prisma.merchandiseProduct.updateMany({
      where: { churchId, provider: "PRINTFUL", externalProductId: { notIn: Array.from(seenExternalIds) } },
      data: { syncStatus: "UNAVAILABLE" },
    });

    await prisma.printfulConnection.updateMany({ where: { churchId }, data: { lastSyncAt: new Date(), lastSyncStatus: failed > 0 ? "PARTIAL" : "SUCCESS", lastSyncError: null } });

    await prisma.merchandiseSyncLog.update({
      where: { id: log.id },
      data: { status: failed > 0 ? "PARTIAL" : "SUCCESS", productsReceived: received, productsCreated: created, productsUpdated: updated, productsFailed: failed, completedAt: new Date() },
    });

    await logDashboardAction({
      churchId,
      actorUserId: params.actorUserId ?? undefined,
      actorEmail: params.actorEmail ?? undefined,
      actorRole: params.actorRole ?? undefined,
      action: "printful.product_sync_completed",
      entityType: "MerchandiseSyncLog",
      entityId: log.id,
      metadata: { received, created, updated, failed },
      req: params.req,
    });

    return { received, created, updated, failed, status: failed > 0 ? "PARTIAL" : "SUCCESS" };
  } catch (err: any) {
    console.error("Printful product sync failed:", err);
    await prisma.printfulConnection.updateMany({ where: { churchId }, data: { lastSyncStatus: "FAILED", lastSyncError: err?.message ?? "Unknown error" } });
    await prisma.merchandiseSyncLog.update({
      where: { id: log.id },
      data: { status: "FAILED", errorMessage: err?.message ?? "Unknown error", completedAt: new Date() },
    });
    throw err;
  }
}
