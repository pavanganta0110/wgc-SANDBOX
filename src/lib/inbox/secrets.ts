import crypto from "crypto";

/**
 * AES-256-GCM encryption for the Zoho tokens and per-mailbox client secrets stored by the admin Inbox.
 * The key is INBOX_ENCRYPTION_KEY (base64, 32 bytes: `openssl rand -base64 32`). For setups that already had
 * the Aplos key from the first release, APLOS_CREDENTIAL_ENCRYPTION_KEY is accepted as a fallback; the stored
 * format is the same envelope, so either name decrypts the same data. Never logs or returns a key or secret.
 */
const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export class InboxEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InboxEncryptionConfigError";
  }
}

function loadKey(): Buffer {
  const raw = (process.env.INBOX_ENCRYPTION_KEY || process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new InboxEncryptionConfigError(
      "INBOX_ENCRYPTION_KEY is not configured. Generate one with `openssl rand -base64 32`, add it as a server-only environment variable, and redeploy."
    );
  }
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== KEY_BYTES) {
    throw new InboxEncryptionConfigError(`INBOX_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${decoded.length}). Generate one with \`openssl rand -base64 32\`.`);
  }
  return decoded;
}

export function encryptInboxSecret(plaintext: string): string {
  const key = loadKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return JSON.stringify({ version: "v1", iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") });
}

export function decryptInboxSecret(serialized: string): string {
  const key = loadKey();
  try {
    const e = JSON.parse(serialized) as { version: string; iv: string; authTag: string; ciphertext: string };
    if (e.version !== "v1") throw new Error("version");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(e.iv, "base64"));
    decipher.setAuthTag(Buffer.from(e.authTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(e.ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Failed to decrypt a stored Inbox credential. The encryption key may have changed; reconnect the mailbox.");
  }
}
