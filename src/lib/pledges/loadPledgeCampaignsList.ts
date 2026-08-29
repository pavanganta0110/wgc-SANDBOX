import { prisma } from "@/lib/prisma";
import { computeCampaignProgress } from "@/lib/pledges/pledgeFulfillment";

export interface PledgeCampaignRow {
  id: string;
  name: string;
  description: string | null;
  campaignType: string;
  status: string;
  fundId: string | null;
  fundName: string | null;
  goalAmountCents: number | null;
  startDate: Date | null;
  endDate: Date | null;
  unitLabel: string | null;
  unitAmountCents: number | null;
  publicSlug: string | null;
  pledgeCount: number;
  totalPledgedCents: number;
  totalFulfilledCents: number;
  percentOfGoal: number | null;
  createdAt: Date;
}

export async function loadPledgeCampaignsList(churchId: string, filters: { status?: string } = {}): Promise<PledgeCampaignRow[]> {
  const campaigns = await prisma.pledgeCampaign.findMany({
    where: { churchId, ...(filters.status ? { status: filters.status } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (campaigns.length === 0) return [];

  const progress = await Promise.all(campaigns.map((c) => computeCampaignProgress(churchId, c.id)));

  return campaigns.map((c, i) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    campaignType: c.campaignType,
    status: c.status,
    fundId: c.fundId,
    fundName: c.fundName,
    goalAmountCents: c.goalAmountCents,
    startDate: c.startDate,
    endDate: c.endDate,
    unitLabel: c.unitLabel,
    unitAmountCents: c.unitAmountCents,
    publicSlug: c.publicSlug,
    pledgeCount: progress[i].pledgeCount,
    totalPledgedCents: progress[i].totalPledgedCents,
    totalFulfilledCents: progress[i].totalFulfilledCents,
    percentOfGoal: progress[i].percentOfGoal,
    createdAt: c.createdAt,
  }));
}
