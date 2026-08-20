import {
  encryptSecret,
  decryptSecret,
  serializeEnvelope,
  deserializeEnvelope,
  getActiveEncryptionKeyFingerprint,
  QuickBooksDecryptionError,
} from "./encryption";

/**
 * QuickBooks-specific credential handling on top of the generic AES-256-GCM
 * primitives in encryption.ts — mirrors src/lib/integrations/aplos/credentials.ts.
 * This is the only module that should ever touch a plaintext QuickBooks
 * access/refresh token outside of the auth provider itself.
 */

export interface EncryptedTokenFields {
  accessTokenEncrypted: string; // JSON envelope, see encryption.ts
  refreshTokenEncrypted: string; // JSON envelope
  encryptionKeyFingerprint: string;
}

/** Encrypts a freshly-obtained (or refreshed) access+refresh token pair for
 * storage. Called only from the OAuth callback route and the refresh path
 * in authProvider.ts — never stores an unverified token pair. */
export function encryptQuickBooksTokens(accessToken: string, refreshToken: string): EncryptedTokenFields {
  return {
    accessTokenEncrypted: serializeEnvelope(encryptSecret(accessToken)),
    refreshTokenEncrypted: serializeEnvelope(encryptSecret(refreshToken)),
    encryptionKeyFingerprint: getActiveEncryptionKeyFingerprint(),
  };
}

export class QuickBooksCredentialKeyMismatchError extends Error {
  constructor() {
    super(
      "This QuickBooks connection was encrypted with a different QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY " +
        "than the one currently configured. It cannot be decrypted until the correct key is " +
        "restored, or the organization reconnects to QuickBooks."
    );
    this.name = "QuickBooksCredentialKeyMismatchError";
  }
}

function assertActiveKey(row: { encryptionKeyFingerprint: string | null }): void {
  const activeFingerprint = getActiveEncryptionKeyFingerprint();
  if (row.encryptionKeyFingerprint !== activeFingerprint) {
    throw new QuickBooksCredentialKeyMismatchError();
  }
}

export function decryptQuickBooksAccessToken(row: { accessTokenEncrypted: string; encryptionKeyFingerprint: string | null }): string {
  assertActiveKey(row);
  try {
    return decryptSecret(deserializeEnvelope(row.accessTokenEncrypted));
  } catch (err) {
    if (err instanceof QuickBooksDecryptionError) throw err;
    throw new QuickBooksDecryptionError("Failed to decrypt the stored QuickBooks access token.");
  }
}

export function decryptQuickBooksRefreshToken(row: { refreshTokenEncrypted: string; encryptionKeyFingerprint: string | null }): string {
  assertActiveKey(row);
  try {
    return decryptSecret(deserializeEnvelope(row.refreshTokenEncrypted));
  } catch (err) {
    if (err instanceof QuickBooksDecryptionError) throw err;
    throw new QuickBooksDecryptionError("Failed to decrypt the stored QuickBooks refresh token.");
  }
}
