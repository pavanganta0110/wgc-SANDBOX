import {
  encryptSecret,
  decryptSecret,
  serializeEnvelope,
  deserializeEnvelope,
  fingerprintSecret,
  getActiveEncryptionKeyFingerprint,
  AplosDecryptionError,
} from "./encryption";

/**
 * Aplos-specific credential handling on top of the generic AES-256-GCM
 * primitives in encryption.ts. This is the only module that should ever
 * touch a plaintext Aplos private key outside of the auth provider itself —
 * every other layer (API routes, UI, sync services) works with the encrypted
 * row or the decrypted value only for the single request that needs it, and
 * never persists or logs the plaintext.
 */

export interface EncryptedCredentialFields {
  encryptedPrivateKey: string; // JSON envelope, see encryption.ts
  privateKeyFingerprint: string;
  encryptionKeyFingerprint: string;
}

/**
 * Encrypts a freshly-submitted Aplos private key for storage. Called only
 * from the connect/reconnect API route, immediately after the key has been
 * used once to prove it works (Test Connection) — never stores an
 * unverified key as the org's active credential.
 */
export function encryptAplosPrivateKey(plaintextPrivateKey: string): EncryptedCredentialFields {
  const envelope = encryptSecret(plaintextPrivateKey);
  return {
    encryptedPrivateKey: serializeEnvelope(envelope),
    privateKeyFingerprint: fingerprintSecret(plaintextPrivateKey),
    encryptionKeyFingerprint: getActiveEncryptionKeyFingerprint(),
  };
}

export class AplosCredentialKeyMismatchError extends Error {
  constructor() {
    super(
      "This Aplos connection was encrypted with a different APLOS_CREDENTIAL_ENCRYPTION_KEY " +
        "than the one currently configured. It cannot be decrypted until the correct key is " +
        "restored, or the organization reconnects with a new private key."
    );
    this.name = "AplosCredentialKeyMismatchError";
  }
}

/**
 * Decrypts a stored Aplos private key. Checks the stored
 * encryptionKeyFingerprint against the currently active key's fingerprint
 * *before* attempting decryption, so a key-rotation mismatch fails with a
 * clear, specific error instead of the generic "corrupted or wrong key"
 * message decryptSecret() gives for a raw GCM auth-tag failure (which also
 * covers real tampering, so it deliberately stays generic there).
 */
export function decryptAplosPrivateKey(row: {
  encryptedPrivateKey: string;
  encryptionKeyFingerprint: string;
}): string {
  const activeFingerprint = getActiveEncryptionKeyFingerprint();
  if (row.encryptionKeyFingerprint !== activeFingerprint) {
    throw new AplosCredentialKeyMismatchError();
  }

  const envelope = deserializeEnvelope(row.encryptedPrivateKey);
  try {
    return decryptSecret(envelope);
  } catch (err) {
    if (err instanceof AplosDecryptionError) throw err;
    throw new AplosDecryptionError("Failed to decrypt the stored Aplos private key.");
  }
}
