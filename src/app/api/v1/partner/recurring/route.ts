import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api/response";
import { resolveSubscriptionDisplayStatus } from "@/lib/subscriptions/subscriptionStatus";
import { withPartnerApiAuth } from "@/lib/partners/partnerApiAuth";
import { pageWithOrganization, resolvePartnerListScope } from "@/lib/partners/partnerApiScope";

/**
 * Recurring giving schedules of the partner's organizations: who gives, how much, how often,
 * the status (ACTIVE, PAST_DUE, CANCELED, ...), the next charge date and why one was cancelled
 * or failed. Each with its `organization`. Optional `donorId` and `status`.
 */
export const GET = withPartnerApiAuth(async (req, auth, requestId) => {
  const resolved = await resolvePartnerListScope(req, auth, requestId);
  if ("response" in resolved) return resolved.response;
  const { scope } = resolved;
  const donorId = scope.searchParams.get("donorId") || undefined;

  const subs = await prisma.finixSubscription.findMany({
    where: { churchId: { in: scope.churchIds }, ...(donorId ? { donorId } : {}) },
    orderBy: [{ createdAtFinix: "desc" }, { id: "desc" }],
    take: scope.limit + 1,
    ...(scope.cursor ? { cursor: { id: scope.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      churchId: true,
      donorId: true,
      fundId: true,
      fundName: true,
      givingLinkId: true,
      amountCents: true,
      donationAmountCents: true,
      donorCoversFee: true,
      currency: true,
      billingInterval: true,
      state: true,
      nextBillingDate: true,
      startedAt: true,
      canceledAt: true,
      completedAt: true,
      cancelReason: true,
      failureCode: true,
      failureMessage: true,
      retryCount: true,
    },
  });

  const { data, hasMore, nextCursor } = pageWithOrganization(subs, scope);
  const wantStatus = scope.searchParams.get("status")?.toUpperCase();
  const shaped = data
    .map((s) => ({
      id: s.id,
      organization: s.organization,
      donorId: s.donorId,
      status: resolveSubscriptionDisplayStatus({ rawState: s.state, canceledAt: s.canceledAt, completedAt: s.completedAt }),
      interval: s.billingInterval,
      giftCents: s.donationAmountCents ?? s.amountCents,
      chargedCents: s.amountCents,
      feeCovered: s.donorCoversFee ?? false,
      currency: s.currency,
      designation: { fundId: s.fundId, fundName: s.fundName },
      givingLinkId: s.givingLinkId,
      startedAt: s.startedAt,
      nextChargeAt: s.nextBillingDate,
      canceledAt: s.canceledAt,
      cancelReason: s.cancelReason,
      lastFailure: s.failureCode || s.failureMessage ? { code: s.failureCode, message: s.failureMessage, retryCount: s.retryCount } : null,
    }))
    .filter((s) => !wantStatus || s.status === wantStatus);
  return apiSuccess(shaped, requestId, { count: shaped.length, hasMore, nextCursor });
});
