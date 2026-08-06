import { prisma } from "@/lib/prisma";
import { ManualCredentialAuthProvider, decryptAccessToken, type AplosCredentials } from "./authProvider";
import { verifyPartnerAccess, AplosPartnerVerifyError } from "./partners";
import { encryptAplosPrivateKey, decryptAplosPrivateKey } from "./credentials";
import { fingerprintSecret } from "./encryption";
import { validateCredentialInput, type ValidatedCredentialInput } from "./credentialValidation";
import type { NormalizedAplosError } from "./errors";

/**
 * Orchestrates the full Aplos connection-verification sequence, per the
 * approved Checkpoint 3 spec:
 *   1. Validate the submitted credentials (credentialValidation.ts)
 *   2. Obtain and decrypt an Aplos access token (authProvider.ts, real call)
 *   3. Make one real authenticated read-only request (partners.ts, real call)
 *   4. Confirm the requested organization/account is accessible
 *   5. Validate the Aplos response at runtime (types.ts type guards)
 *   6. Only then report success
 *
 * This module is the single place both the Test Connection and Connect
 * routes call into, so the two can never drift apart on what "verified"
 * means. Neither route persists anything until this sequence fully
 * succeeds — see connectOrganization()'s doc comment for exactly what is
 * (and is not) written to the database on failure.
 */

export interface VerificationSuccess {
  success: true;
  aplosAccountId: string;
}

export interface VerificationFailure {
  success: false;
  normalized: NormalizedAplosError;
}

export type VerificationResult = VerificationSuccess | VerificationFailure;

/**
 * Runs the real verification sequence against Aplos. Never persists
 * anything — pure verification. A single-use ManualCredentialAuthProvider
 * is constructed per call (not the shared/cached one) because this is
 * evaluating credentials that may not even be the org's stored ones yet.
 */
export async function runAplosVerification(input: ValidatedCredentialInput): Promise<VerificationResult> {
  const credentials: AplosCredentials = {
    clientId: input.clientId,
    privateKeyMaterial: input.privateKeyMaterial,
  };

  // Ephemeral, single-use provider — not cached beyond this call. The key
  // passed to getAccessToken is irrelevant (there is only ever one caller),
  // kept only because the interface is per-church-keyed.
  const authProvider = new ManualCredentialAuthProvider(async () => credentials);

  try {
    const token = await authProvider.getAccessToken("verification-attempt");
    const verification = await verifyPartnerAccess(token.token, input.aplosAccountId);

    if (!verification.authorized || verification.aplos_account_id !== input.aplosAccountId) {
      return {
        success: false,
        normalized: { category: "ACCESS_DENIED", retryable: false, safeMessage: "Aplos denied access to the specified organization/account with these credentials." },
      };
    }

    return { success: true, aplosAccountId: verification.aplos_account_id };
  } catch (err) {
    if (err instanceof AplosPartnerVerifyError) {
      return { success: false, normalized: err.normalized };
    }
    // AplosAuthError from authProvider.ts (getAccessToken) — same shape.
    const normalized = (err as { normalized?: NormalizedAplosError })?.normalized;
    if (normalized) return { success: false, normalized };
    return { success: false, normalized: { category: "UNKNOWN_ERROR", retryable: false, safeMessage: "An unexpected error occurred verifying the Aplos connection." } };
  }
}

/**
 * Test Connection: runs the real verification sequence and returns the
 * result. Never creates a new AplosConnection row. If one already exists
 * for this church, records the attempt (lastConnectionTestAt, and on
 * failure lastErrorAt/lastErrorCode/lastErrorMessage) without touching the
 * stored credential, organization id, or CONNECTED status — a failed
 * re-test does not retroactively invalidate a previously verified
 * connection; see connectOrganization() for what actually changes status.
 */
export async function testConnection(churchId: string, rawInput: unknown): Promise<VerificationResult> {
  const input = validateCredentialInput(rawInput as Record<string, unknown>);
  const result = await runAplosVerification(input);

  const existing = await prisma.aplosConnection.findUnique({ where: { churchId } });
  if (existing) {
    if (result.success) {
      await prisma.aplosConnection.update({
        where: { churchId },
        data: { lastConnectionTestAt: new Date() },
      });
    } else {
      await prisma.aplosConnection.update({
        where: { churchId },
        data: {
          lastConnectionTestAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorCode: result.normalized.category,
          lastErrorMessage: result.normalized.safeMessage,
        },
      });
    }
  }

  return result;
}

export interface ConnectResult {
  result: VerificationResult;
  /** True if a new connection row was created or an existing one updated to
   * CONNECTED. False for every failure case (see doc comment above). */
  connected: boolean;
}

/**
 * Connect: runs the same verification sequence as testConnection(), then
 * persists.
 *
 * On SUCCESS: encrypts the private key and upserts AplosConnection with
 * status CONNECTED, the encrypted credential, fingerprints, the confirmed
 * aplosAccountId, and the merchant-provided label (see organizationLabel's
 * doc comment — Aplos's /partners/verify returns no organization name, so
 * this is never something Aplos told us).
 *
 * On FAILURE: the encrypted private key, fingerprints, and organization id
 * are NEVER written — a failed attempt never leaves an unverified
 * credential at rest. If no AplosConnection row exists yet, none is
 * created (status reads as NOT_CONNECTED via absence). If a row already
 * exists (the merchant is trying to reconnect/rotate credentials and the
 * new ones failed), only status/error fields are updated — the previously
 * verified credential, if any, is left exactly as it was.
 */
export async function connectOrganization(
  churchId: string,
  rawInput: unknown,
  organizationLabel: string | null
): Promise<ConnectResult> {
  const input = validateCredentialInput(rawInput as Record<string, unknown>);
  const result = await runAplosVerification(input);

  const existing = await prisma.aplosConnection.findUnique({ where: { churchId } });

  if (!result.success) {
    if (existing) {
      await prisma.aplosConnection.update({
        where: { churchId },
        data: {
          status: mapErrorCategoryToStatus(result.normalized.category),
          lastConnectionTestAt: new Date(),
          lastErrorAt: new Date(),
          lastErrorCode: result.normalized.category,
          lastErrorMessage: result.normalized.safeMessage,
        },
      });
    }
    return { result, connected: false };
  }

  const encrypted = encryptAplosPrivateKey(input.privateKeyMaterial);
  const now = new Date();

  await prisma.aplosConnection.upsert({
    where: { churchId },
    create: {
      churchId,
      clientId: input.clientId,
      ...encrypted,
      aplosOrganizationId: result.aplosAccountId,
      aplosOrganizationName: organizationLabel,
      status: "CONNECTED",
      connectedAt: now,
      lastConnectionTestAt: now,
    },
    update: {
      clientId: input.clientId,
      ...encrypted,
      aplosOrganizationId: result.aplosAccountId,
      aplosOrganizationName: organizationLabel,
      status: "CONNECTED",
      connectedAt: now,
      lastConnectionTestAt: now,
      lastErrorAt: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      disconnectedAt: null,
    },
  });

  return { result, connected: true };
}

function mapErrorCategoryToStatus(category: NormalizedAplosError["category"]): string {
  switch (category) {
    case "ACCESS_DENIED":
    case "AUTHENTICATION_REQUIRED":
      return "INVALID_CREDENTIALS";
    case "INVALID_CONFIGURATION":
      return "REAUTHENTICATION_REQUIRED";
    default:
      return "ERROR";
  }
}

/**
 * Disconnects a church's Aplos connection. Per the approved MVP decision:
 * deletes the encrypted private key and fingerprints outright (reconnecting
 * requires fresh authorization) rather than merely disabling — this
 * codebase has no product requirement for "recoverable disabled
 * credentials" to weigh against that default. Preserves the row itself
 * (status history, aplosOrganizationId for reference) and disables
 * automatic sync. Sync history (AplosSyncRecord/AplosSyncAttempt, not used
 * until a later checkpoint) is untouched by this function — nothing here
 * deletes sync records.
 */
export async function disconnectConnection(churchId: string): Promise<void> {
  await prisma.aplosConnection.update({
    where: { churchId },
    data: {
      status: "DISCONNECTED",
      automaticSyncEnabled: false,
      disconnectedAt: new Date(),
      encryptedPrivateKey: PLACEHOLDER_REMOVED_KEY,
      privateKeyFingerprint: PLACEHOLDER_REMOVED_KEY,
      encryptionKeyFingerprint: PLACEHOLDER_REMOVED_KEY,
    },
  });
}

// AplosConnection.encryptedPrivateKey/privateKeyFingerprint/
// encryptionKeyFingerprint are required (non-nullable) columns — there is no
// "empty" credential state to null them out to. This sentinel is never a
// valid encrypted envelope, fingerprint, or key fingerprint (all of those
// are always well-formed JSON/hex produced by encryption.ts), so any code
// path that tried to decrypt it would fail loudly via deserializeEnvelope's
// shape validation rather than silently succeeding — but the real
// invariant this relies on is status: only a "CONNECTED" row is ever
// decrypted (see decryptStoredCredential below), and disconnect always sets
// status away from CONNECTED in the same update.
const PLACEHOLDER_REMOVED_KEY = "DISCONNECTED_KEY_REMOVED";

/**
 * Decrypts the currently stored credential for a church's connection — used
 * by the status/re-test-without-body path. Only ever called for a row whose
 * status is CONNECTED (callers must check first); calling it against a
 * disconnected row's placeholder value will throw, which is the correct,
 * safe outcome.
 */
export async function decryptStoredCredential(churchId: string): Promise<AplosCredentials> {
  const connection = await prisma.aplosConnection.findUniqueOrThrow({ where: { churchId } });
  const privateKeyMaterial = decryptAplosPrivateKey(connection);
  return { clientId: connection.clientId, privateKeyMaterial };
}

export { fingerprintSecret, decryptAccessToken };
