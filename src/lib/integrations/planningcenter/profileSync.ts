import { prisma } from "@/lib/prisma";
import { PlanningCenterApiError, PlanningCenterSetupError } from "./errors";
import { getClientForChurch } from "./service";
import { resolveDonorLink } from "./personMatching";
import { ensureProfileSetup, getStoredProfileSetup, writeProfileValues, type ProfileSetup } from "./profileFields";
import { buildDonorSummaries, digestOf, donorPageUrl, profileFieldValues } from "./profileSummary";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * Keeps each matched person's "WGC Giving" section in Planning Center current. No Giving donation is ever created.
 *
 * Safe by construction:
 *  - only people already matched to a WGC donor are written (an unmatched donor is looked up, never created);
 *  - a donor who asked to stay anonymous is never written;
 *  - writes READ first and change only what differs, and a fingerprint of the last write means nothing is sent again
 *    until the summary changes (or a week passes, which repairs a value someone edited by hand);
 *  - a failure for one person never affects another, and nothing here can touch a payment.
 */

/** A written section is re-checked at least this often, which also repairs a value someone deleted in Planning Center. */
export const PROFILE_REVERIFY_MS = 7 * 24 * 60 * 60 * 1000;
const SUMMARY_CHUNK = 500;
const STOP_CATEGORIES = ["AUTHENTICATION_REQUIRED", "ACCESS_DENIED", "RATE_LIMITED"];

export interface ProfileSyncSummary {
  updated: number;
  unchanged: number;
  /** Donors with no matched Planning Center person yet: nothing to write, nothing created. */
  unmatched: number;
  failed: number;
  stoppedForTime: boolean;
}

const emptySummary = (): ProfileSyncSummary => ({ updated: 0, unchanged: 0, unmatched: 0, failed: 0, stoppedForTime: false });

async function connectedOrg(churchId: string): Promise<string | null> {
  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  return connection && connection.status === "CONNECTED" && connection.pcoOrganizationId ? connection.pcoOrganizationId : null;
}

async function setupFor(churchId: string, client: PlanningCenterClient): Promise<ProfileSetup> {
  return (await getStoredProfileSetup(churchId)) ?? (await ensureProfileSetup(churchId, client));
}

/** One donor, right now (used the moment a gift succeeds or changes). Never throws. */
export async function syncProfileForDonor(
  churchId: string,
  donorId: string,
  options: { client?: PlanningCenterClient; now?: Date } = {}
): Promise<"UPDATED" | "UNCHANGED" | "UNMATCHED" | "SKIPPED" | "FAILED"> {
  try {
    const orgId = await connectedOrg(churchId);
    if (!orgId) return "SKIPPED";
    const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId }, select: { id: true, anonymousPreference: true, archivedAt: true, mergedIntoDonorId: true } });
    if (!donor || donor.anonymousPreference || donor.archivedAt || donor.mergedIntoDonorId) return "SKIPPED";

    const client = options.client ?? (await getClientForChurch(churchId));
    // Matches an unmatched donor if it can; a person who can't be matched is never created.
    const state = await resolveDonorLink(churchId, donorId, orgId, client);
    if (state.status !== "LINKED" || !state.pcoPersonId) return "UNMATCHED";

    const now = options.now ?? new Date();
    const summary = (await buildDonorSummaries(churchId, [donorId], now)).get(donorId);
    if (!summary) return "SKIPPED";
    const values = profileFieldValues(summary, donorPageUrl(donorId));
    const digest = digestOf(values);

    const link = await prisma.planningCenterPersonLink.findUnique({ where: { churchId_donorId: { churchId, donorId } } });
    if (link?.profileDigest === digest && link.profileSyncedAt && now.getTime() - link.profileSyncedAt.getTime() < PROFILE_REVERIFY_MS) return "UNCHANGED";

    const setup = await setupFor(churchId, client);
    const result = await writeProfileValues(client, state.pcoPersonId, setup, values);
    await prisma.planningCenterPersonLink.update({ where: { churchId_donorId: { churchId, donorId } }, data: { profileDigest: digest, profileSyncedAt: now } });
    return result.written > 0 ? "UPDATED" : "UNCHANGED";
  } catch (err) {
    console.error(`planning-center profile: donor ${donorId}:`, err instanceof Error ? err.message : err);
    return "FAILED";
  }
}

/**
 * Every matched donor in the church, in one pass inside a time budget. DB-only until something actually changed, so a
 * church whose people are already up to date costs no Planning Center calls at all. Resumable: whoever didn't fit in
 * the budget is simply still "out of date" on the next pass.
 */
export async function syncProfilesForChurch(
  churchId: string,
  options: { client?: PlanningCenterClient; now?: () => Date; deadlineMs?: number; timeBudgetMs?: number } = {}
): Promise<ProfileSyncSummary> {
  const summary = emptySummary();
  const clock = options.now ?? (() => new Date());
  const orgId = await connectedOrg(churchId);
  if (!orgId) return summary;

  const [links, donorsRaw] = await Promise.all([
    prisma.planningCenterPersonLink.findMany({ where: { churchId, status: "LINKED", pcoPersonId: { not: null } }, orderBy: { profileSyncedAt: { sort: "asc", nulls: "first" } } }),
    prisma.donor.findMany({ where: { churchId, archivedAt: null, mergedIntoDonorId: null, anonymousPreference: false }, select: { id: true } }),
  ]);
  const eligible = new Set(donorsRaw.map((d) => d.id));
  const candidates = links.filter((l) => eligible.has(l.donorId));

  const startedAt = clock();
  const due: Array<{ donorId: string; pcoPersonId: string; values: Record<string, string | null>; digest: string }> = [];
  for (let i = 0; i < candidates.length; i += SUMMARY_CHUNK) {
    const chunk = candidates.slice(i, i + SUMMARY_CHUNK);
    const summaries = await buildDonorSummaries(churchId, chunk.map((l) => l.donorId), startedAt);
    for (const link of chunk) {
      const s = summaries.get(link.donorId);
      if (!s) continue;
      const values = profileFieldValues(s, donorPageUrl(link.donorId));
      const digest = digestOf(values);
      const fresh = link.profileDigest === digest && link.profileSyncedAt && startedAt.getTime() - link.profileSyncedAt.getTime() < PROFILE_REVERIFY_MS;
      if (fresh) summary.unchanged++;
      else due.push({ donorId: link.donorId, pcoPersonId: link.pcoPersonId as string, values, digest });
    }
  }
  if (due.length === 0) return summary;

  const client = options.client ?? (await getClientForChurch(churchId));
  const setup = await setupFor(churchId, client);
  const deadline = options.deadlineMs ?? clock().getTime() + (options.timeBudgetMs ?? 45_000);

  for (const item of due) {
    if (deadline - clock().getTime() <= 2000) {
      summary.stoppedForTime = true;
      break;
    }
    try {
      const result = await writeProfileValues(client, item.pcoPersonId, setup, item.values);
      await prisma.planningCenterPersonLink.update({ where: { churchId_donorId: { churchId, donorId: item.donorId } }, data: { profileDigest: item.digest, profileSyncedAt: clock() } });
      if (result.written > 0) summary.updated++;
      else summary.unchanged++;
    } catch (err) {
      // Sign-in or permission trouble, or a rate limit, would hit everyone: stop for now. Anything else affects only this person.
      if (err instanceof PlanningCenterSetupError) break; // Planning Center refused (a People administrator is needed)
      if (err instanceof PlanningCenterApiError && STOP_CATEGORIES.includes(err.normalized.category)) break;
      console.error(`planning-center profile: donor ${item.donorId}:`, err instanceof Error ? err.message : err);
      summary.failed++;
    }
  }
  return summary;
}
