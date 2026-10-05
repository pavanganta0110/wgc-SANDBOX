import { prisma } from "@/lib/prisma";

/**
 * All "amount raised" figures in this module are computed live by summing
 * the already-correct, webhook-maintained GivingLink counters
 * (totalCollectedCents/refundedCents/returnedCents — updated by the
 * existing Finix webhook handler on every successful charge, refund, and
 * return) plus tagged ExternalDonation rows. Nothing is cached here, so a
 * refund that already adjusted GivingLink.refundedCents is reflected
 * immediately with zero new code in the payment/refund/webhook path.
 * Mirrors the "compute on read, no cached aggregate" convention already
 * used by computeCampaignProgress (pledges) and donor analytics.
 */

interface RaisedResult {
  raisedCents: number;
  linkIds: string[];
}

async function sumGivingLinks(where: { churchId: string } & Record<string, string>): Promise<RaisedResult> {
  const links = await prisma.givingLink.findMany({
    where,
    select: { id: true, totalCollectedCents: true, refundedCents: true, returnedCents: true },
  });
  const raisedCents = links.reduce(
    (sum, l) => sum + l.totalCollectedCents - l.refundedCents - l.returnedCents,
    0
  );
  return { raisedCents, linkIds: links.map((l) => l.id) };
}

async function sumExternalDonations(where: { churchId: string } & Record<string, string>): Promise<number> {
  const rows = await prisma.externalDonation.findMany({
    where: { ...where, status: { notIn: ["RETURNED", "VOIDED"] } },
    select: { donationAmountCents: true },
  });
  return rows.reduce((sum, r) => sum + r.donationAmountCents, 0);
}

export async function getCampaignRaisedCents(churchId: string, campaignId: string): Promise<number> {
  const [links, external] = await Promise.all([
    sumGivingLinks({ churchId, fundraisingCampaignId: campaignId }),
    sumExternalDonations({ churchId, fundraisingCampaignId: campaignId }),
  ]);
  return links.raisedCents + external;
}

export async function getTeamRaisedCents(churchId: string, teamId: string): Promise<number> {
  const [links, external] = await Promise.all([
    sumGivingLinks({ churchId, campaignTeamId: teamId }),
    sumExternalDonations({ churchId, campaignTeamId: teamId }),
  ]);
  return links.raisedCents + external;
}

export async function getFundraiserRaisedCents(churchId: string, fundraiserId: string): Promise<number> {
  const [links, external] = await Promise.all([
    sumGivingLinks({ churchId, campaignFundraiserId: fundraiserId }),
    sumExternalDonations({ churchId, campaignFundraiserId: fundraiserId }),
  ]);
  return links.raisedCents + external;
}

/** Distinct supporter count for a campaign/team/fundraiser — dedupes a
 * donor who gave both online and offline (or more than once) to the same
 * scope. Guest payments/external donations with no matched donor record
 * still each count once as their own row id, so a real gift is never
 * silently dropped from the count. */
export async function getDonorCount(churchId: string, filter: Record<string, string>): Promise<number> {
  const [links, externalDonations] = await Promise.all([
    prisma.givingLink.findMany({ where: { churchId, ...filter }, select: { id: true } }),
    prisma.externalDonation.findMany({
      where: { churchId, ...filter, status: { notIn: ["RETURNED", "VOIDED"] } },
      select: { id: true, donorId: true },
    }),
  ]);
  const linkIds = links.map((l) => l.id);
  const payments = linkIds.length
    ? await prisma.payment.findMany({
        where: { churchId, givingLinkId: { in: linkIds }, status: "SUCCEEDED" },
        select: { id: true, donorId: true },
      })
    : [];

  const identities = new Set<string>();
  for (const p of payments) identities.add(p.donorId ?? `payment:${p.id}`);
  for (const d of externalDonations) identities.add(d.donorId ?? `external:${d.id}`);
  return identities.size;
}

export interface RecentGift {
  id: string;
  amountCents: number;
  donorName: string | null; // null = show as Anonymous
  message: string | null;
  createdAt: Date;
}

/** Recent successful gifts for a campaign/team/fundraiser, newest first —
 * respects both the per-payment isAnonymous flag and the donor's own
 * standing anonymousPreference. Backs both the live donation wall and the
 * campaign detail page's recent-donations list. */
export async function getRecentGifts(
  churchId: string,
  filter: Record<string, string>,
  limit = 20
): Promise<RecentGift[]> {
  const links = await prisma.givingLink.findMany({ where: { churchId, ...filter }, select: { id: true } });
  const linkIds = links.map((l) => l.id);

  const [payments, externalDonations] = await Promise.all([
    linkIds.length
      ? prisma.payment.findMany({
          where: { churchId, givingLinkId: { in: linkIds }, status: "SUCCEEDED" },
          select: { id: true, donationAmountCents: true, amountCents: true, donorId: true, isAnonymous: true, note: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: limit,
        })
      : Promise.resolve([]),
    prisma.externalDonation.findMany({
      where: { churchId, ...filter, status: { notIn: ["RETURNED", "VOIDED"] } },
      select: { id: true, donationAmountCents: true, donorId: true, isAnonymous: true, donationDate: true },
      orderBy: { donationDate: "desc" },
      take: limit,
    }),
  ]);

  const donorIds = Array.from(
    new Set(
      [...payments.map((p) => p.donorId), ...externalDonations.map((d) => d.donorId)].filter(
        (id): id is string => !!id
      )
    )
  );
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } }, select: { id: true, name: true, anonymousPreference: true } })
    : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));

  const resolveName = (donorId: string | null, isAnonymous: boolean): string | null => {
    if (isAnonymous) return null;
    const donor = donorId ? donorById.get(donorId) : null;
    if (donor?.anonymousPreference) return null;
    return donor?.name ?? null;
  };

  const gifts: RecentGift[] = [
    ...payments.map((p) => ({
      id: p.id,
      amountCents: p.donationAmountCents ?? p.amountCents,
      donorName: resolveName(p.donorId, p.isAnonymous),
      message: p.note,
      createdAt: p.createdAt,
    })),
    ...externalDonations.map((d) => ({
      id: d.id,
      amountCents: d.donationAmountCents,
      donorName: resolveName(d.donorId, d.isAnonymous),
      message: null,
      createdAt: d.donationDate,
    })),
  ];

  return gifts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

function percentOfGoal(raisedCents: number, goalAmountCents: number | null): number | null {
  if (!goalAmountCents) return null;
  return Math.min(100, Math.round((raisedCents / goalAmountCents) * 100));
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  slug: string;
  raisedCents: number;
  goalAmountCents: number | null;
  percentOfGoal: number | null;
  donorCount: number;
}

export async function getFundraiserLeaderboard(
  churchId: string,
  campaignId: string,
  teamId?: string
): Promise<LeaderboardEntry[]> {
  const fundraisers = await prisma.campaignFundraiser.findMany({
    where: { churchId, fundraisingCampaignId: campaignId, ...(teamId ? { campaignTeamId: teamId } : {}) },
    select: { id: true, displayName: true, slug: true, goalAmountCents: true },
  });

  const entries = await Promise.all(
    fundraisers.map(async (f) => {
      const [raisedCents, donorCount] = await Promise.all([
        getFundraiserRaisedCents(churchId, f.id),
        getDonorCount(churchId, { campaignFundraiserId: f.id }),
      ]);
      return {
        id: f.id,
        name: f.displayName,
        slug: f.slug,
        raisedCents,
        goalAmountCents: f.goalAmountCents,
        percentOfGoal: percentOfGoal(raisedCents, f.goalAmountCents),
        donorCount,
      };
    })
  );

  return entries.sort((a, b) => b.raisedCents - a.raisedCents);
}

export async function getTeamLeaderboard(churchId: string, campaignId: string): Promise<LeaderboardEntry[]> {
  const teams = await prisma.campaignTeam.findMany({
    where: { churchId, fundraisingCampaignId: campaignId },
    select: { id: true, name: true, slug: true, goalAmountCents: true },
  });

  const entries = await Promise.all(
    teams.map(async (t) => {
      const [raisedCents, donorCount] = await Promise.all([
        getTeamRaisedCents(churchId, t.id),
        getDonorCount(churchId, { campaignTeamId: t.id }),
      ]);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        raisedCents,
        goalAmountCents: t.goalAmountCents,
        percentOfGoal: percentOfGoal(raisedCents, t.goalAmountCents),
        donorCount,
      };
    })
  );

  return entries.sort((a, b) => b.raisedCents - a.raisedCents);
}

export interface CampaignOverview {
  raisedCents: number;
  goalAmountCents: number | null;
  percentOfGoal: number | null;
  donorCount: number;
  averageGiftCents: number;
  recurringDonorCount: number;
  topFundraiser: LeaderboardEntry | null;
  topTeam: LeaderboardEntry | null;
  recentGifts: RecentGift[];
}

export async function getCampaignOverview(churchId: string, campaignId: string): Promise<CampaignOverview> {
  const campaign = await prisma.fundraisingCampaign.findFirst({
    where: { id: campaignId, churchId },
    select: { goalAmountCents: true },
  });

  const links = await prisma.givingLink.findMany({
    where: { churchId, fundraisingCampaignId: campaignId },
    select: { id: true, recurringEnabled: true },
  });
  const linkIds = links.map((l) => l.id);

  const [raisedCents, donorCount, fundraiserLeaderboard, teamLeaderboard, recentGifts, recurringSubscriptionCount] =
    await Promise.all([
      getCampaignRaisedCents(churchId, campaignId),
      getDonorCount(churchId, { fundraisingCampaignId: campaignId }),
      getFundraiserLeaderboard(churchId, campaignId),
      getTeamLeaderboard(churchId, campaignId),
      getRecentGifts(churchId, { fundraisingCampaignId: campaignId }, 10),
      linkIds.length
        ? prisma.finixSubscription.count({
            // Raw Finix processor state — "PAST_DUE" is a computed display
            // status derived elsewhere, never a stored value here (see
            // FinixSubscription.state's doc comment).
            where: { churchId, givingLinkId: { in: linkIds }, state: "ACTIVE" },
          })
        : Promise.resolve(0),
    ]);

  const goalAmountCents = campaign?.goalAmountCents ?? null;

  return {
    raisedCents,
    goalAmountCents,
    percentOfGoal: percentOfGoal(raisedCents, goalAmountCents),
    donorCount,
    averageGiftCents: donorCount > 0 ? Math.round(raisedCents / donorCount) : 0,
    recurringDonorCount: recurringSubscriptionCount,
    topFundraiser: fundraiserLeaderboard[0] ?? null,
    topTeam: teamLeaderboard[0] ?? null,
    recentGifts,
  };
}
