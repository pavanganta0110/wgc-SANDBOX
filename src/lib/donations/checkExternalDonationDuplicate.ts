import { prisma } from "@/lib/prisma";

const NEARBY_DAYS = 3;

export interface DuplicateCheckInput {
  churchId: string;
  donorId?: string | null;
  donationAmountCents: number;
  donationDate: Date;
  externalTransactionId?: string | null;
  confirmationNumber?: string | null;
  /** Exclude this row's own id when checking on update, not just create. */
  excludeId?: string;
}

/**
 * Soft duplicate warning per spec: same donor + amount + nearby date, OR a
 * matching external transaction ID / confirmation number. Never a hard
 * block — callers surface this as a warning the merchant can override.
 */
export async function findPossibleDuplicateExternalDonation(input: DuplicateCheckInput) {
  const { churchId, donorId, donationAmountCents, donationDate, externalTransactionId, confirmationNumber, excludeId } = input;

  const referenceMatches: string[] = [];
  if (externalTransactionId) referenceMatches.push(externalTransactionId);
  if (confirmationNumber) referenceMatches.push(confirmationNumber);

  const nearbyStart = new Date(donationDate);
  nearbyStart.setDate(nearbyStart.getDate() - NEARBY_DAYS);
  const nearbyEnd = new Date(donationDate);
  nearbyEnd.setDate(nearbyEnd.getDate() + NEARBY_DAYS);

  const candidate = await prisma.externalDonation.findFirst({
    where: {
      churchId,
      status: { not: "VOIDED" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        ...(donorId ? [{ donorId, donationAmountCents, donationDate: { gte: nearbyStart, lte: nearbyEnd } }] : []),
        ...(referenceMatches.length > 0
          ? [{ externalTransactionId: { in: referenceMatches } }, { confirmationNumber: { in: referenceMatches } }]
          : []),
      ],
    },
    select: { id: true, donationAmountCents: true, donationDate: true, paymentMethod: true },
  });

  return candidate;
}
