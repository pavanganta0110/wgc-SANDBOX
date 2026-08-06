import crypto from "crypto";
import { cookies } from "next/headers";

// Cache JWKs in memory
let googleJwks: any = null;
let googleJwksExpiry = 0;
let appleJwks: any = null;
let appleJwksExpiry = 0;

const JWK_TTL_MS = 60 * 60 * 1000; // 1 hour

function getSessionSecret(): Buffer {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    throw new Error("AUTH_SESSION_SECRET is not set.");
  }
  // Ensure we get a 32-byte key for AES-256
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypt a string using AES-256-GCM
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getSessionSecret(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}.${encrypted}.${authTag}`;
}

/**
 * Decrypt a string using AES-256-GCM
 */
export function decrypt(cipherText: string): string {
  const [ivHex, encryptedHex, authTagHex] = cipherText.split(".");
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error("Invalid cipher text format");
  }
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getSessionSecret(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Open Redirect Protection Check
 */
export function isValidRedirect(url: string): boolean {
  if (!url) return false;
  // Ensure it's a relative URL starting with a single '/'
  if (url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\")) {
    return true;
  }
  // Allow absolute URLs that match the public app URL or local development hosts
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  try {
    const parsed = new URL(url);
    const allowedHosts = [
      new URL(appUrl).host,
      "localhost:3000",
      "localhost:3001",
      "wgcpayments.com",
      "www.wgcpayments.com",
    ];
    return allowedHosts.includes(parsed.host);
  } catch {
    return false;
  }
}

/**
 * Opaque state cookie manager
 */
export interface JourneyState {
  mode: "login" | "signup" | "invite" | "activation" | "reauth";
  redirectTo?: string;
  promotion?: string; // e.g. "SIX_MONTHS_FREE"
  inviteToken?: string;
  activationToken?: string;
  reauthType?: string; // e.g. "billing", "cancellation", "security"
}

export async function setOpaqueJourneyState(stateToken: string, payload: JourneyState) {
  const encrypted = encrypt(JSON.stringify(payload));
  const cookieStore = await cookies();
  cookieStore.set(`oauth_journey_${stateToken}`, encrypted, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600, // 10 minutes
  });
}

export async function getOpaqueJourneyState(stateToken: string): Promise<JourneyState | null> {
  const cookieStore = await cookies();
  const cookieName = `oauth_journey_${stateToken}`;
  const encrypted = cookieStore.get(cookieName)?.value;
  if (!encrypted) return null;

  try {
    const decrypted = decrypt(encrypted);
    // Delete cookie immediately to prevent replay
    cookieStore.delete(cookieName);
    return JSON.parse(decrypted);
  } catch (err) {
    console.error("Failed to decrypt journey state cookie:", err);
    return null;
  }
}

/**
 * Fetch and verify JWKs
 */
async function getJwks(provider: "google" | "apple"): Promise<any[]> {
  const now = Date.now();
  if (provider === "google") {
    if (googleJwks && now < googleJwksExpiry) return googleJwks;
    const res = await fetch("https://www.googleapis.com/oauth2/v3/certs");
    const data = await res.json();
    googleJwks = data.keys;
    googleJwksExpiry = now + JWK_TTL_MS;
    return googleJwks;
  } else {
    if (appleJwks && now < appleJwksExpiry) return appleJwks;
    const res = await fetch("https://appleid.apple.com/auth/keys");
    const data = await res.json();
    appleJwks = data.keys;
    appleJwksExpiry = now + JWK_TTL_MS;
    return appleJwks;
  }
}

/**
 * Validate and decode Google or Apple ID Token (JWT)
 */
export async function verifyIdToken(
  token: string,
  provider: "google" | "apple"
): Promise<{ sub: string; email: string; name?: string }> {
  const [headerB64, payloadB64, signatureB64] = token.split(".");
  if (!headerB64 || !payloadB64 || !signatureB64) {
    throw new Error("Invalid JWT token format");
  }

  const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));

  // Verify Issuer
  if (provider === "google") {
    const validIssuers = ["https://accounts.google.com", "accounts.google.com"];
    if (!validIssuers.includes(payload.iss)) {
      throw new Error(`Invalid Google issuer: ${payload.iss}`);
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error("GOOGLE_CLIENT_ID is not configured");
    if (payload.aud !== clientId) {
      throw new Error(`Invalid Google audience: ${payload.aud}`);
    }
  } else {
    if (payload.iss !== "https://appleid.apple.com") {
      throw new Error(`Invalid Apple issuer: ${payload.iss}`);
    }
    const clientId = process.env.APPLE_CLIENT_ID;
    if (!clientId) throw new Error("APPLE_CLIENT_ID is not configured");
    if (payload.aud !== clientId) {
      throw new Error(`Invalid Apple audience: ${payload.aud}`);
    }
  }

  // Verify Expiry
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp < nowSeconds - 300) { // 5-minute clock skew tolerance
    throw new Error("ID token has expired");
  }

  // Signature verification
  const keys = await getJwks(provider);
  const jwk = keys.find((k: any) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(`Could not find public key for key ID: ${header.kid}`);
  }

  const publicKey = crypto.createPublicKey({ format: "jwk", key: jwk });
  const verify = crypto.createVerify("SHA256");
  verify.update(`${headerB64}.${payloadB64}`);
  
  const isValid = verify.verify(publicKey, Buffer.from(signatureB64, "base64url"));
  if (!isValid) {
    throw new Error("Invalid cryptographic signature on ID token");
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name ? `${payload.name.givenName || ""} ${payload.name.familyName || ""}`.trim() : undefined,
  };
}
