import { prisma } from "@/lib/prisma";

export interface PartnerOrganizationRow {
  id: string;
  name: string;
  reference: string | null;
  status: string;
  createdAt: Date;
  giftCount: number;
  giftTotalCents: number;
  lastGiftAt: Date | null;
}

/**
 * The organizations linked to one partner, with simple gift totals. `partnerId`
 * must come from the signed-in partner session, never from a request: it is the
 * only thing that scopes this to one partner's organizations.
 */
export async function loadPartnerOrganizations(partnerId: string): Promise<PartnerOrganizationRow[]> {
  const churches = await prisma.church.findMany({
    where: { partnerId },
    select: { id: true, name: true, partnerReference: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  if (churches.length === 0) return [];

  const totals = await prisma.payment.groupBy({
    by: ["churchId"],
    where: { churchId: { in: churches.map((c) => c.id) }, status: "SUCCEEDED" },
    _count: { _all: true },
    _sum: { amountCents: true },
    _max: { createdAt: true },
  });
  const byChurch = new Map(totals.map((t) => [t.churchId, t]));

  return churches.map((c) => {
    const t = byChurch.get(c.id);
    return {
      id: c.id,
      name: c.name,
      reference: c.partnerReference,
      status: c.status,
      createdAt: c.createdAt,
      giftCount: t?._count._all ?? 0,
      giftTotalCents: t?._sum.amountCents ?? 0,
      lastGiftAt: t?._max.createdAt ?? null,
    };
  });
}
