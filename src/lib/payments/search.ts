import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Free-text search over payments: one box that matches the payer's name or
 * email, a student's ID or name, an amount, the payment's note or term, or a
 * transaction id. Resolves to the matching Finix transfer ids; the caller
 * intersects them with its other filters. The caller always passes the
 * session-derived scopes, so a search can never reach outside the viewer's
 * organization or attribution scope.
 */

export const MAX_SEARCH_LENGTH = 100;

export function normalizeSearchQuery(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH);
}

/** "$1,250.50", "1250.5", "25" -> cents; anything that is not purely an amount -> null. */
export function parseSearchAmountCents(query: string): number | null {
  const cleaned = query.trim().replace(/^\$/, "");
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(cleaned)) return null;
  const cents = Math.round(parseFloat(cleaned.replace(/,/g, "")) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

/** Intersects id lists, ignoring filters that were not applied (null). Null when no filter applied at all. */
export function intersectIdSets(sets: (string[] | null)[]): string[] | null {
  const applied = sets.filter((s): s is string[] => s !== null);
  if (applied.length === 0) return null;
  return applied.reduce((acc, set) => {
    const lookup = new Set(set);
    return acc.filter((id) => lookup.has(id));
  });
}

export async function resolveSearchMatchedTransferIds(params: {
  churchId: string;
  paymentScope: Prisma.PaymentWhereInput;
  transferScope: Prisma.FinixTransferWhereInput;
  query: string;
}): Promise<string[]> {
  const { churchId, paymentScope, transferScope } = params;
  const query = normalizeSearchQuery(params.query);
  if (!query) return [];

  const cents = parseSearchAmountCents(query);
  const tokens = query.split(" ").filter(Boolean).slice(0, 4);
  const insensitive = { contains: query, mode: "insensitive" as const };

  const [donors, students] = await Promise.all([
    prisma.donor.findMany({
      where: { churchId, OR: [{ name: insensitive }, { email: insensitive }] },
      select: { id: true },
      take: 500,
    }),
    prisma.student.findMany({
      where: {
        churchId,
        OR: [
          { studentNumber: insensitive },
          {
            AND: tokens.map((t) => ({
              OR: [
                { firstName: { contains: t, mode: "insensitive" as const } },
                { lastName: { contains: t, mode: "insensitive" as const } },
              ],
            })),
          },
        ],
      },
      select: { id: true },
      take: 500,
    }),
  ]);

  const conditions: Prisma.PaymentWhereInput[] = [
    { note: insensitive },
    { studentTermLabel: insensitive },
    { finixTransferId: insensitive },
  ];
  if (donors.length) conditions.push({ donorId: { in: donors.map((d) => d.id) } });
  if (students.length) conditions.push({ studentId: { in: students.map((s) => s.id) } });
  if (cents !== null) conditions.push({ amountCents: cents }, { donationAmountCents: cents });

  const [payments, transfers] = await Promise.all([
    prisma.payment.findMany({
      where: { AND: [paymentScope, { finixTransferId: { not: null } }, { OR: conditions }] },
      select: { finixTransferId: true },
      take: 5000,
    }),
    // Transfers with no Payment row (for example invoice payments) can still be found by amount.
    cents !== null
      ? prisma.finixTransfer.findMany({
          where: { AND: [transferScope, { amountCents: cents }] },
          select: { finixTransferId: true },
          take: 5000,
        })
      : Promise.resolve([]),
  ]);

  return [...new Set([...payments, ...transfers].map((r) => r.finixTransferId as string))];
}
