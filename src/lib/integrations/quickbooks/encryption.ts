import crypto from "crypto";

/**
 * Authenticated encryption for QuickBooks OAuth tokens — same AES-256-GCM
 * versioned-envelope scheme as src/lib/integrations/aplos/encryption.ts and
 * src/lib/integrations/printful/encryption.ts, kept as a separate module
 * (own env var, own key) so a QuickBooks key rotation never touches Aplos
 * or Printful credentials and vice versa. See aplos/encryption.ts for the
 * full design rationale; this is intentionally a near-identical
 * implementation, not a shared abstraction, to keep each integration's
 * credential blast radius isolated.
 */

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const KEY_BYTES = 32;
const IV_BYTES = 12;

export interface EncryptedEnvelope {
  version: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export class QuickBooksEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickBooksEncryptionConfigError";
  }
}

export class QuickBooksDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuickBooksDecryptionError";
  }
}

let cachedKey: Buffer | null = null;
let cachedKeyFingerprint: string | null = null;

function loadEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw || raw.trim() === "") {
    throw new QuickBooksEncryptionConfigError(
      "QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY is not configured. Generate one with `openssl rand -base64 32` and set it as a server-only environment variable (never NEXT_PUBLIC_*). Only required once a real QuickBooks connection is stored."
    );
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new QuickBooksEncryptionConfigError("QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY is not valid base64.");
  }
  if (decoded.length !== KEY_BYTES) {
    throw new QuickBooksEncryptionConfigError(`QUICKBOOKS_CREDENTIAL_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes (got ${decoded.length}).`);
  }

  cachedKey = decoded;
  return decoded;
}

export function getActiveEncryptionKeyFingerprint(): string {
  if (cachedKeyFingerprint) return cachedKeyFingerprint;
  const key = loadEncryptionKey();
  cachedKeyFingerprint = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  return cachedKeyFingerprint;
}

export function encryptSecret(plaintext: string): EncryptedEnvelope {
  const key = loadEncryptionKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    version: ENVELOPE_VERSION,
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptSecret(envelope: EncryptedEnvelope): string {
  if (envelope.version !== ENVELOPE_VERSION) {
    throw new QuickBooksDecryptionError(`Unsupported encryption envelope version "${envelope.version}".`);
  }
  const key = loadEncryptionKey();
  try {
    const iv = Buffer.from(envelope.iv, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintextBuffer = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintextBuffer.toString("utf8");
  } catch {
    throw new QuickBooksDecryptionError("Failed to decrypt stored credential — data may be corrupted or encrypted with a different key.");
  }
}

export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope);
}

export function deserializeEnvelope(raw: string): EncryptedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuickBooksDecryptionError("Stored credential envelope is not valid JSON.");
  }
  const p = parsed as Record<string, unknown>;
  if (!p || typeof p !== "object" || typeof p.version !== "string" || typeof p.iv !== "string" || typeof p.authTag !== "string" || typeof p.ciphertext !== "string") {
    throw new QuickBooksDecryptionError("Stored credential envelope has an unexpected shape.");
  }
  return parsed as EncryptedEnvelope;
}

export function __resetEncryptionKeyCacheForTests(): void {
  cachedKey = null;
  cachedKeyFingerprint = null;
}
