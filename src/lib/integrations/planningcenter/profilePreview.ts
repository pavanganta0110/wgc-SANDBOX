import { prisma } from "@/lib/prisma";
import { PROFILE_FIELDS, PROFILE_TAB_NAME } from "./profileFields";
import { buildDonorSummaries, describeSummary } from "./profileSummary";

/**
 * "How will it look?" for the people-only option, worked out from WGC's own data. Nothing is sent to Planning Center and
 * Giving doesn't need to be set up, so a church can look before it commits.
 */

export interface ProfilePreview {
  sectionName: string;
  fields: Array<{ name: string; type: string }>;
  /** A few real donors, as their Planning Center profile would read. */
  samples: Array<{ donorName: string; matchedPersonName: string | null; rows: Array<{ label: string; value: string }> }>;
  counts: {
    /** Donors who have given and are matched to a Planning Center person: these get the section. */
    matched: number;
    /** Donors who have given but aren't matched yet: nothing is written and no person is created for them. */
    notMatched: number;
    /** Donors who asked to stay anonymous: never written. */
    anonymous: number;
  };
}

const SAMPLE_SIZE = 5;

export async function getProfilePreview(churchId: string, now: Date = new Date()): Promise<ProfilePreview> {
  const [links, givers] = await Promise.all([
    prisma.planningCenterPersonLink.findMany({ where: { churchId, status: "LINKED" }, select: { donorId: true, pcoPersonName: true } }),
    prisma.payment.groupBy({ by: ["donorId"], where: { churchId, donorId: { not: null }, status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, isAnonymous: false } }),
  ]);
  const giverIds = givers.map((g) => g.donorId).filter((id): id is string => Boolean(id));
  const donors = giverIds.length
    ? await prisma.donor.findMany({ where: { churchId, id: { in: giverIds }, archivedAt: null, mergedIntoDonorId: null }, select: { id: true, name: true, anonymousPreference: true } })
    : [];
  const donorById = new Map(donors.map((d) => [d.id, d]));
  const linkByDonor = new Map(links.map((l) => [l.donorId, l]));

  const named = donors.filter((d) => !d.anonymousPreference);
  const matched = named.filter((d) => linkByDonor.has(d.id));
  const notMatched = named.filter((d) => !linkByDonor.has(d.id));

  // Show matched donors first (that's what real profiles will look like), then fill with unmatched ones.
  const pool = [...matched, ...notMatched].slice(0, 60);
  const summaries = await buildDonorSummaries(churchId, pool.map((d) => d.id), now);
  const ranked = pool
    .map((d) => ({ donor: d, summary: summaries.get(d.id)! }))
    .filter((x) => x.summary && x.summary.giftCount > 0)
    .sort((a, b) => Number(linkByDonor.has(b.donor.id)) - Number(linkByDonor.has(a.donor.id)) || b.summary.lifetimeCents - a.summary.lifetimeCents)
    .slice(0, SAMPLE_SIZE);

  return {
    sectionName: PROFILE_TAB_NAME,
    fields: PROFILE_FIELDS.map((f) => ({ name: f.name, type: f.dataType === "number" ? "Number" : f.dataType === "date" ? "Date" : "Text" })),
    samples: ranked.map(({ donor, summary }) => ({
      donorName: donorById.get(donor.id)?.name ?? "Donor",
      matchedPersonName: linkByDonor.get(donor.id)?.pcoPersonName ?? null,
      rows: describeSummary(summary),
    })),
    counts: { matched: matched.length, notMatched: notMatched.length, anonymous: donors.filter((d) => d.anonymousPreference).length },
  };
}
