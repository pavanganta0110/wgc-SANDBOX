import crypto from "crypto";

/**
 * Authenticated encryption for Aplos merchant credentials (client id is not
 * secret; the private key is). AES-256-GCM via Node's built-in crypto — no
 * new dependency, and no reversible-encryption utility existed anywhere in
 * this codebase to reuse (confirmed during the Checkpoint 1 audit; the only
 * prior precedent, src/lib/auth/password.ts, is one-way hashing and cannot
 * be repurposed here since Aplos requires the plaintext key back to
 * authenticate).
 *
 * Storage envelope is versioned so a future key-rotation or algorithm change
 * never has to guess how an already-stored row was encrypted:
 *   { version, iv, authTag, ciphertext }  (iv/authTag/ciphertext are base64)
 * serialized to a single JSON string for the AplosConnection.encryptedPrivateKey
 * column (a plain String, matching this schema's existing convention of never
 * using structured/binary column types for opaque blobs).
 *
 * Never logs, never returns, and never includes in any response the
 * plaintext key or the raw encryption key itself — only derived fingerprints
 * (see fingerprintSecret / getActiveEncryptionKeyFingerprint).
 */

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_VERSION = "v1";
const KEY_BYTES = 32; // AES-256
const IV_BYTES = 12; // GCM-recommended IV length

export interface EncryptedEnvelope {
  version: string;
  iv: string; // base64
  authTag: string; // base64
  ciphertext: string; // base64
}

export class AplosEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AplosEncryptionConfigError";
  }
}

export class AplosDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AplosDecryptionError";
  }
}

let cachedKey: Buffer | null = null;
let cachedKeyFingerprint: string | null = null;

/**
 * Loads and validates APLOS_CREDENTIAL_ENCRYPTION_KEY. Validation is lazy
 * (runs on first real use, not at module import) so `next build`,
 * typechecking, and any environment that never actually calls encrypt/decrypt
 * never fails just because the var isn't set there — matches how every other
 * secret in this codebase (e.g. FINIX_WEBHOOK_SECRET) is read at module
 * scope without throwing. The *decoded byte length* is validated, not the
 * string length, so a well-formed but wrong-size key is caught immediately
 * rather than silently truncated/padded by the cipher call.
 *
 * Required format: base64-encoded 32 raw bytes (e.g. `openssl rand -base64 32`).
 * Deliberately a single canonical format rather than accepting base64 OR hex
 * — accepting two formats risks a misconfigured value being silently
 * misinterpreted as the wrong one.
 */
function loadEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.APLOS_CREDENTIAL_ENCRYPTION_KEY;
  if (!raw || raw.trim() === "") {
    throw new AplosEncryptionConfigError(
      "APLOS_CREDENTIAL_ENCRYPTION_KEY is not configured. Generate one with " +
        "`openssl rand -base64 32` and set it as a server-only environment " +
        "variable (never NEXT_PUBLIC_*). Use a separate key for sandbox and " +
        "production."
    );
  }

  let decoded: Buffer;
  try {
    decoded = Buffer.from(raw.trim(), "base64");
  } catch {
    throw new AplosEncryptionConfigError(
      "APLOS_CREDENTIAL_ENCRYPTION_KEY is not valid base64."
    );
  }

  if (decoded.length !== KEY_BYTES) {
    throw new AplosEncryptionConfigError(
      `APLOS_CREDENTIAL_ENCRYPTION_KEY must decode to exactly ${KEY_BYTES} bytes ` +
        `(got ${decoded.length}). Generate one with \`openssl rand -base64 32\`.`
    );
  }

  cachedKey = decoded;
  return decoded;
}

/**
 * SHA-256 of the raw key bytes, hex, truncated to 16 characters — safe to
 * store in AplosConnection.encryptionKeyFingerprint and compare against on
 * decrypt so a future key rotation is detected explicitly (see
 * credentials.ts) instead of failing with an opaque GCM auth-tag mismatch.
 * Never exposes any recoverable information about the key itself (SHA-256
 * is one-way; 16 hex chars is a display/comparison fingerprint, not a
 * capacity-reduced key).
 */
export function getActiveEncryptionKeyFingerprint(): string {
  if (cachedKeyFingerprint) return cachedKeyFingerprint;
  const key = loadEncryptionKey();
  cachedKeyFingerprint = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  return cachedKeyFingerprint;
}

/** Throws AplosEncryptionConfigError if the key is missing/malformed — call
 * explicitly wherever "validate at server use" should happen eagerly (e.g.
 * the connect-credentials API route), rather than deferring to whatever
 * encrypt/decrypt call happens to run first. */
export function assertEncryptionKeyConfigured(): void {
  loadEncryptionKey();
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
    throw new AplosDecryptionError(
      `Unsupported encryption envelope version "${envelope.version}" (expected "${ENVELOPE_VERSION}").`
    );
  }

  const key = loadEncryptionKey();
  try {
    const iv = Buffer.from(envelope.iv, "base64");
    const authTag = Buffer.from(envelope.authTag, "base64");
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // Never surface the underlying crypto error (could leak timing/format
    // detail) — a GCM auth-tag failure means either tampering or the wrong
    // key, and both should read identically to a caller.
    throw new AplosDecryptionError("Failed to decrypt stored credential — data may be corrupted or encrypted with a different key.");
  }
}

export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope);
}

/** Hand-rolled shape validation (no runtime-validation library exists in
 * this codebase yet — matches the existing pattern of typeof-narrowing
 * helper functions, e.g. isSafeString in the diagnostics routes, rather
 * than introducing a new dependency for one shape). */
export function deserializeEnvelope(raw: string): EncryptedEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new AplosDecryptionError("Stored credential envelope is not valid JSON.");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).version !== "string" ||
    typeof (parsed as Record<string, unknown>).iv !== "string" ||
    typeof (parsed as Record<string, unknown>).authTag !== "string" ||
    typeof (parsed as Record<string, unknown>).ciphertext !== "string"
  ) {
    throw new AplosDecryptionError("Stored credential envelope has an unexpected shape.");
  }
  return parsed as EncryptedEnvelope;
}

/**
 * SHA-256 of a plaintext secret, hex, truncated to 16 characters — used for
 * AplosConnection.privateKeyFingerprint so a merchant can confirm which key
 * is connected ("...a1b2c3d4") without the plaintext ever being retrievable
 * again. One-way; never used for decryption.
 */
export function fingerprintSecret(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext, "utf8").digest("hex").slice(0, 16);
}

/** Test-only: clears the module-level key cache so tests can exercise
 * different APLOS_CREDENTIAL_ENCRYPTION_KEY values across cases without
 * leaking state between them. Not exported from any public entry point
 * other than this module — intentionally not used by production code. */
export function __resetEncryptionKeyCacheForTests(): void {
  cachedKey = null;
  cachedKeyFingerprint = null;
}
