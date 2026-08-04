import { prisma } from "@/lib/prisma";

/**
 * Atomically allocates the next invoice number for a church, e.g.
 * "INV-000001". Uses a single upsert with `nextInvoiceSequence: { increment: 1 }`
 * — Postgres row-level locking on the UPDATE makes concurrent callers
 * serialize correctly, so no two invoices can ever be allocated the same
 * number, without needing a separate retry-on-collision loop (unlike
 * ticketNumber.ts's approach, which has no per-church settings row to
 * increment against). InvoiceSettings is created on first use with
 * `nextInvoiceSequence` defaulting to 1 in the schema, so the first
 * invoice for a church is always INV-000001.
 */
export async function generateNextInvoiceNumber(churchId: string): Promise<string> {
  const settings = await prisma.invoiceSettings.upsert({
    where: { churchId },
    create: { churchId, nextInvoiceSequence: 2 },
    update: { nextInvoiceSequence: { increment: 1 } },
    select: { nextInvoiceSequence: true, invoiceNumberPrefix: true },
  });
  const sequence = settings.nextInvoiceSequence - 1;
  return `${settings.invoiceNumberPrefix}${String(sequence).padStart(6, "0")}`;
}

/** Validates a merchant-supplied custom invoice number — must be non-empty,
 * reasonably short, and free of characters that would break URLs/CSV/PDF
 * rendering. Uniqueness per church is enforced by the DB constraint
 * (@@unique([churchId, invoiceNumber])); callers must catch the resulting
 * P2002 and surface a clear "already in use" error, never guess a fallback. */
export function isValidCustomInvoiceNumber(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= 50 && /^[A-Za-z0-9\-_./ ]+$/.test(trimmed);
}
