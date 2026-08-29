import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";

export interface PledgeRow {
  id: string;
  pledgeCampaignId: string;
  campaignName: string;
  donorId: string | null;
  donorName: string;
  donorEmail: string | null;
  donorMatchStatus: string;
  isAnonymous: boolean;
  pledgeAmountCents: number;
  fulfilledAmountCents: number;
  unitCount: number | null;
  status: string;
  pledgedAt: Date;
  dueDate: Date | null;
  fulfilledAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

export interface PledgeListFilters {
  pledgeCampaignId?: string;
  donorId?: string;
  status?: string;
  // Team-access row-scoping — same convention as
  // SubscriptionCandidateFilters.attributedUserId. Undefined = full
  // organization scope; a string value scopes to that user's
  // Pledge.attributedUserId only.
  attributedUserId?: string;
}

export async function loadPledgesList(churchId: string, filters: PledgeListFilters = {}): Promise<PledgeRow[]> {
  const pledges = await prisma.pledge.findMany({
    where: {
      churchId,
      ...(filters.pledgeCampaignId ? { pledgeCampaignId: filters.pledgeCampaignId } : {}),
      ...(filters.donorId ? { donorId: filters.donorId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.attributedUserId ? { attributedUserId: filters.attributedUserId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 2000,
  });
  if (pledges.length === 0) return [];

  const donorIds = [...new Set(pledges.map((p) => p.donorId).filter((x): x is string => !!x))];
  const campaignIds = [...new Set(pledges.map((p) => p.pledgeCampaignId))];

  const [donors, campaigns] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { id: { in: donorIds } } }) : Promise.resolve([]),
    prisma.pledgeCampaign.findMany({ where: { id: { in: campaignIds } }, select: { id: true, name: true } }),
  ]);
  const donorById = new Map(donors.map((d) => [d.id, d]));
  const campaignById = new Map(campaigns.map((c) => [c.id, c.name]));

  return pledges.map((p) => {
    const donor = p.donorId ? donorById.get(p.donorId) : null;
    const donorName = p.isAnonymous ? "Anonymous" : donor ? formatPersonName(donor.name) : "Unmatched Pledge";
    return {
      id: p.id,
      pledgeCampaignId: p.pledgeCampaignId,
      campaignName: campaignById.get(p.pledgeCampaignId) ?? "—",
      donorId: p.donorId,
      donorName,
      donorEmail: donor?.email ?? null,
      donorMatchStatus: p.donorMatchStatus,
      isAnonymous: p.isAnonymous,
      pledgeAmountCents: p.pledgeAmountCents,
      fulfilledAmountCents: p.fulfilledAmountCents,
      unitCount: p.unitCount,
      status: p.status,
      pledgedAt: p.pledgedAt,
      dueDate: p.dueDate,
      fulfilledAt: p.fulfilledAt,
      notes: p.notes,
      createdAt: p.createdAt,
    };
  });
}
