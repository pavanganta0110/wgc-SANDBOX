import { prisma } from "@/lib/prisma";
import { getClientForChurch } from "./service";
import { PlanningCenterApiError } from "./errors";
import { getDonation, updateDonationPerson } from "./givingApi";
import { resolveDonorLink } from "./personMatching";
import type { PlanningCenterClient } from "./resourceClient";

/**
 * "Send now, attach the person later." A gift from a donor who wasn't matched yet goes to Planning Center
 * immediately with no person (so nothing is held back and no duplicate person is ever created). Once the donor IS
 * matched — automatically on a later lookup, or by the church choosing the right person — the person is attached to
 * the donation. Attaching sets the same value every time, so repeating it is harmless.
 */

export interface AttachSummary {
  attached: number;
  /** The donor asked to stay anonymous (or the gift is anonymous): the gift is left without a person for good. */
  cleared: number;
  /** Still no matched person: left for next time. */
  waiting: number;
  flagged: number;
}

export async function attachPendingPeople(churchId: string, options: { client?: PlanningCenterClient; limit?: number } = {}): Promise<AttachSummary> {
  const summary: AttachSummary = { attached: 0, cleared: 0, waiting: 0, flagged: 0 };

  const pending = await prisma.planningCenterDonationRecord.findMany({
    where: { churchId, status: "CREATED", attachPersonPending: true, pcoDonationId: { not: null } },
    orderBy: { updatedAt: "asc" },
    take: options.limit ?? 50,
  });
  if (pending.length === 0) return summary;

  const connection = await prisma.planningCenterConnection.findUnique({ where: { churchId } });
  if (!connection || connection.status !== "CONNECTED" || !connection.pcoOrganizationId) return summary;
  const orgId = connection.pcoOrganizationId;

  const payments = await prisma.payment.findMany({ where: { churchId, id: { in: pending.map((p) => p.paymentId) } }, select: { id: true, donorId: true, isAnonymous: true } });
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const donorIds = [...new Set(payments.map((p) => p.donorId).filter((id): id is string => Boolean(id)))];
  const donors = donorIds.length ? await prisma.donor.findMany({ where: { churchId, id: { in: donorIds } }, select: { id: true, anonymousPreference: true } }) : [];
  const anonymousDonor = new Map(donors.map((d) => [d.id, d.anonymousPreference]));

  const client = options.client ?? (await getClientForChurch(churchId));

  for (const rec of pending) {
    try {
      const payment = paymentById.get(rec.paymentId);
      // Anonymity is the donor's choice: never name someone who asked not to be named, even later.
      if (!payment || !payment.donorId || payment.isAnonymous || anonymousDonor.get(payment.donorId)) {
        await prisma.planningCenterDonationRecord.update({ where: { id: rec.id }, data: { attachPersonPending: false } });
        summary.cleared++;
        continue;
      }

      const state = await resolveDonorLink(churchId, payment.donorId, orgId, client);
      if (state.status !== "LINKED" || !state.pcoPersonId) {
        summary.waiting++;
        continue;
      }

      await updateDonationPerson(client, rec.pcoDonationId as string, state.pcoPersonId);
      // Read it back: only a confirmed change clears the flag.
      const donation = await getDonation(client, rec.pcoDonationId as string);
      if (!donation) {
        await prisma.planningCenterDonationRecord.update({
          where: { id: rec.id },
          data: { status: "NEEDS_REVIEW", attachPersonPending: false, lastErrorCode: "GONE", lastErrorMessage: "This gift is no longer in Planning Center, so the person couldn't be attached. Check the batch." },
        });
        summary.flagged++;
        continue;
      }
      if (donation.personId === state.pcoPersonId) {
        await prisma.planningCenterDonationRecord.update({ where: { id: rec.id }, data: { attachPersonPending: false, pcoPersonId: state.pcoPersonId } });
        summary.attached++;
      } else {
        summary.waiting++; // not confirmed; try again next time
      }
    } catch (err) {
      // Sign-in or permission trouble, or a rate limit: stop for now. Anything else affects only this gift.
      if (err instanceof PlanningCenterApiError && ["AUTHENTICATION_REQUIRED", "ACCESS_DENIED", "RATE_LIMITED"].includes(err.normalized.category)) break;
      console.error(`planning-center attach: gift ${rec.paymentId}:`, err instanceof Error ? err.message : err);
      summary.waiting++;
    }
  }
  return summary;
}
