import crypto from "crypto";
import { prisma } from "@/lib/prisma";

/** Same random-token + SHA-256-hash pattern as the existing forgot-password/
 * setup-link flow — only the hash is ever stored (InvoicePublicToken.tokenHash),
 * so a leaked database row can never be used to reconstruct a working link. */
export function generateInvoicePublicToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashInvoicePublicToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Returns the invoice's current ACTIVE public token, generating one if none
 * exists. Never regenerates an existing active token silently — a merchant
 * gets the same link every time they click "Copy payment link" until they
 * explicitly regenerate it or the invoice is voided (which revokes it, see
 * the void route). Returns the raw token (only ever returned once per
 * generation, from this function, to the authenticated merchant — never
 * logged, never stored anywhere but as a hash).
 */
export async function ensureInvoicePublicToken(invoiceId: string, churchId: string): Promise<string> {
  const existing = await prisma.invoicePublicToken.findFirst({ where: { invoiceId, status: "ACTIVE" } });
  if (existing) {
    // The raw token isn't stored, so an already-active token can't be
    // re-returned from the DB — this function is only ever the single
    // moment a raw token is minted. Callers needing the link again (e.g.
    // the merchant re-opens the invoice) must have captured it the first
    // time; a fresh generation would silently invalidate any link already
    // sent to the client, which is why we don't regenerate here. Instead,
    // rotate explicitly via regenerateInvoicePublicToken.
    throw new InvoicePublicTokenAlreadyExistsError();
  }
  const { token, tokenHash } = generateInvoicePublicToken();
  await prisma.invoicePublicToken.create({ data: { invoiceId, churchId, tokenHash } });
  return token;
}

export class InvoicePublicTokenAlreadyExistsError extends Error {
  constructor() {
    super("An active payment link already exists for this invoice.");
    this.name = "InvoicePublicTokenAlreadyExistsError";
  }
}

/** Revokes any active token and mints a fresh one — used for explicit
 * "Regenerate link" actions (e.g. after a suspected leak) and automatically
 * when an invoice is voided (see the void route, which only revokes,
 * never regenerates). */
export async function regenerateInvoicePublicToken(invoiceId: string, churchId: string): Promise<string> {
  await prisma.invoicePublicToken.updateMany({ where: { invoiceId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } });
  const { token, tokenHash } = generateInvoicePublicToken();
  await prisma.invoicePublicToken.create({ data: { invoiceId, churchId, tokenHash } });
  return token;
}

export interface ResolvedInvoiceToken {
  invoiceId: string;
  churchId: string;
}

/** Resolves a raw public token to exactly one invoice, or null if the token
 * is invalid/revoked/unknown. Never exposes which failure case occurred to
 * the caller beyond "not found" — no enumeration oracle. */
export async function resolveInvoicePublicToken(token: string): Promise<ResolvedInvoiceToken | null> {
  const tokenHash = hashInvoicePublicToken(token);
  const record = await prisma.invoicePublicToken.findUnique({ where: { tokenHash } });
  if (!record || record.status !== "ACTIVE") return null;
  return { invoiceId: record.invoiceId, churchId: record.churchId };
}
