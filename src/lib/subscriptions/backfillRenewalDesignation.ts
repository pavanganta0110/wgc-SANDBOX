import { prisma } from "@/lib/prisma";

export interface BackfillRenewalDesignationParams {
  /** Limit to one church. Omit to cover every church. */
  churchId?: string;
  /** False (the default for callers) only counts what would change. */
  apply: boolean;
}

export interface BackfillRenewalDesignationResult {
  dryRun: boolean;
  subscriptionsWithFund: number;
  /** Payments that were (or, in a dry run, would be) given their subscription's fund. */
  paymentsAffected: number;
}

/**
 * One-time repair for recurring renewals created before renewals inherited the
 * subscription's fund: stamps fundId/fundName from the subscription onto each
 * of its payments that has no fund. It only ever fills an empty fundId, so it
 * can never overwrite a designation and is safe to run more than once. Money
 * fields are never touched, and nothing here calls a processor endpoint.
 */
export async function backfillRenewalDesignation(params: BackfillRenewalDesignationParams): Promise<BackfillRenewalDesignationResult> {
  const subscriptions = await prisma.finixSubscription.findMany({
    where: { fundId: { not: null }, ...(params.churchId ? { churchId: params.churchId } : {}) },
    select: { finixSubscriptionId: true, churchId: true, fundId: true, fundName: true },
  });

  let paymentsAffected = 0;
  for (const sub of subscriptions) {
    const where = {
      finixSubscriptionId: sub.finixSubscriptionId,
      fundId: null,
      // A payment always has a church; when the subscription knows its church, require the match.
      ...(sub.churchId ? { churchId: sub.churchId } : {}),
    };
    if (params.apply) {
      const { count } = await prisma.payment.updateMany({ where, data: { fundId: sub.fundId, fundName: sub.fundName } });
      paymentsAffected += count;
    } else {
      paymentsAffected += await prisma.payment.count({ where });
    }
  }

  return { dryRun: !params.apply, subscriptionsWithFund: subscriptions.length, paymentsAffected };
}
