import { prisma } from "@/lib/prisma";

/**
 * Read-only monitoring signals for WGC platform billing — every query here
 * reads data already produced by subscriptionReconciliation.ts,
 * wgcSubscriptionWebhook.ts, and the webhook ingestion route. This module
 * never mutates anything and never re-runs live Finix reconciliation; it
 * only surfaces what's already stored so an admin can see what needs
 * manual attention (see the "Reconcile Now" trigger for the one
 * legitimate correction action, which lives elsewhere).
 */

// Matches STALE_PAST_DUE_DAYS in subscriptionReconciliation.ts — same
// threshold, not re-derived independently.
const STALE_PAST_DUE_DAYS = 30;
const PROMOTION_ENDING_SOON_DAYS = 14;

// FinixWebhookEvent.processingStatus values in use (see
// src/app/api/webhooks/finix/route.ts and src/app/api/cron/reconcile/route.ts):
// PENDING (default) | COMPLETED | FAILED | ERROR.
const UNPROCESSED_WEBHOOK_STATUSES = ["PENDING", "FAILED", "ERROR"];

export interface TrialMissingDatesRow {
  subscriptionId: string;
  organizationId: string;
  organizationName: string | null;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  createdAt: Date;
}

export interface FailedChargeRow {
  chargeId: string;
  organizationId: string;
  organizationName: string | null;
  billingPeriod: string | null;
  amountCents: number;
  failureCode: string | null;
  failureMessage: string | null;
  attemptedAt: Date;
}

export interface RetryGroupRow {
  organizationId: string;
  organizationName: string | null;
  billingPeriod: string | null;
  failedCount: number;
}

export interface AuditFlagRow {
  auditLogId: string;
  organizationId: string | null;
  organizationName: string | null;
  subscriptionId: string | null;
  detail: string | null;
  createdAt: Date;
}

export interface UnprocessedWebhookRow {
  webhookEventId: string;
  finixEventId: string;
  type: string;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: Date;
}

export interface StalePastDueRow {
  subscriptionId: string;
  organizationId: string;
  organizationName: string | null;
  pastDueAt: Date | null;
  gracePeriodEndsAt: Date | null;
}

export interface MissingBillingInstrumentRow {
  organizationId: string;
  organizationName: string | null;
  reason: "NO_PAYMENT_INSTRUMENT" | "NO_BILLING_ACCOUNT";
  billingAccountStatus: string | null;
}

export interface PromotionEndingSoonRow {
  entitlementId: string;
  organizationId: string;
  organizationName: string | null;
  source: string;
  endsAt: Date | null;
}

export interface OrgWaitingForBillingSetupRow {
  organizationId: string;
  organizationName: string | null;
  billingSetupStatus: string | null;
  subscriptionStatus: string | null;
}

export interface BillingMonitoringSnapshot {
  trialsMissingFinixDates: TrialMissingDatesRow[];
  failedCharges: FailedChargeRow[];
  retryGroups: RetryGroupRow[];
  routingMismatches: AuditFlagRow[];
  unprocessedWebhooks: UnprocessedWebhookRow[];
  stalePastDue: StalePastDueRow[];
  missingBillingInstruments: MissingBillingInstrumentRow[];
  duplicateReferences: AuditFlagRow[];
  promotionsEndingSoon: PromotionEndingSoonRow[];
  orgsWaitingForBillingSetup: OrgWaitingForBillingSetupRow[];
}

function extractFlagType(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && "flagType" in metadata) {
    const value = (metadata as Record<string, unknown>).flagType;
    return typeof value === "string" ? value : null;
  }
  return null;
}

export async function getBillingMonitoringSnapshot(): Promise<BillingMonitoringSnapshot> {
  const now = new Date();
  const staleThreshold = new Date(now.getTime() - STALE_PAST_DUE_DAYS * 24 * 60 * 60 * 1000);
  const promotionWindowEnd = new Date(now.getTime() + PROMOTION_ENDING_SOON_DAYS * 24 * 60 * 60 * 1000);

  const [
    trialsMissingDates,
    failedCharges,
    failedChargeGroups,
    routingMismatchLogs,
    duplicateReferenceLogs,
    unprocessedWebhooks,
    stalePastDueSubs,
    billingAccounts,
    subscriptionsForOrgCheck,
    promotionsEndingSoon,
    churchesForSetupCheck,
    incompleteSubscriptions,
    orgIdsWithBillingAccount,
  ] = await Promise.all([
    prisma.wgcSubscription.findMany({
      where: { status: "TRIALING", OR: [{ trialStartsAt: null }, { trialEndsAt: null }] },
      orderBy: { createdAt: "desc" },
    }),
    prisma.billingCharge.findMany({
      where: { status: "FAILED", chargeType: "WGC_PLATFORM_SUBSCRIPTION" },
      orderBy: { attemptedAt: "desc" },
      take: 200,
    }),
    prisma.billingCharge.groupBy({
      by: ["organizationId", "billingPeriod"],
      where: { status: "FAILED", chargeType: "WGC_PLATFORM_SUBSCRIPTION" },
      _count: { _all: true },
    }),
    prisma.wgcBillingAuditLog.findMany({
      where: { action: "reconciliation.critical_flag" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.wgcBillingAuditLog.findMany({
      where: { action: "reconciliation.critical_flag" },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.finixWebhookEvent.findMany({
      where: { processingStatus: { in: UNPROCESSED_WEBHOOK_STATUSES } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.wgcSubscription.findMany({
      where: { status: "PAST_DUE", pastDueAt: { lt: staleThreshold } },
      orderBy: { pastDueAt: "asc" },
    }),
    prisma.wgcBillingAccount.findMany({
      where: { billingPaymentInstrumentId: null },
    }),
    prisma.wgcSubscription.findMany({
      select: { organizationId: true },
    }),
    prisma.promotionEntitlement.findMany({
      where: { status: "ACTIVE", endsAt: { gte: now, lte: promotionWindowEnd } },
      orderBy: { endsAt: "asc" },
    }),
    prisma.church.findMany({
      where: { billingSetupStatus: "APPROVED_BILLING_REQUIRED" },
      select: { id: true, name: true, billingSetupStatus: true },
    }),
    prisma.wgcSubscription.findMany({
      where: { status: "INCOMPLETE" },
    }),
    prisma.wgcBillingAccount.findMany({ select: { organizationId: true } }),
  ]);

  const orgsWithBillingAccount = new Set(orgIdsWithBillingAccount.map((a) => a.organizationId));
  const orgsMissingBillingAccount = subscriptionsForOrgCheck
    .map((s) => s.organizationId)
    .filter((orgId) => !orgsWithBillingAccount.has(orgId));

  const orgsWaitingNoSubscription = churchesForSetupCheck.filter(
    (c) => !subscriptionsForOrgCheck.some((s) => s.organizationId === c.id),
  );

  const allOrgIds = new Set<string>([
    ...trialsMissingDates.map((s) => s.organizationId),
    ...failedCharges.map((c) => c.organizationId),
    ...failedChargeGroups.map((g) => g.organizationId),
    ...routingMismatchLogs.map((l) => l.organizationId).filter((id): id is string => Boolean(id)),
    ...duplicateReferenceLogs.map((l) => l.organizationId).filter((id): id is string => Boolean(id)),
    ...stalePastDueSubs.map((s) => s.organizationId),
    ...billingAccounts.map((a) => a.organizationId),
    ...orgsMissingBillingAccount,
    ...promotionsEndingSoon.map((p) => p.organizationId),
    ...orgsWaitingNoSubscription.map((c) => c.id),
    ...incompleteSubscriptions.map((s) => s.organizationId),
  ]);

  const churches = await prisma.church.findMany({
    where: { id: { in: Array.from(allOrgIds) } },
    select: { id: true, name: true },
  });
  const nameByOrgId = new Map(churches.map((c) => [c.id, c.name]));

  const routingMismatches: AuditFlagRow[] = routingMismatchLogs
    .filter((log) => extractFlagType(log.metadata) === "MERCHANT_ROUTING_MISMATCH")
    .map((log) => ({
      auditLogId: log.id,
      organizationId: log.organizationId,
      organizationName: log.organizationId ? nameByOrgId.get(log.organizationId) ?? null : null,
      subscriptionId: log.entityId,
      detail: log.internalReason,
      createdAt: log.createdAt,
    }));

  const duplicateReferences: AuditFlagRow[] = duplicateReferenceLogs
    .filter((log) => extractFlagType(log.metadata) === "DUPLICATE_SUBSCRIPTION_REFERENCE")
    .map((log) => ({
      auditLogId: log.id,
      organizationId: log.organizationId,
      organizationName: log.organizationId ? nameByOrgId.get(log.organizationId) ?? null : null,
      subscriptionId: log.entityId,
      detail: log.internalReason,
      createdAt: log.createdAt,
    }));

  const missingBillingInstruments: MissingBillingInstrumentRow[] = [
    ...billingAccounts.map((a) => ({
      organizationId: a.organizationId,
      organizationName: nameByOrgId.get(a.organizationId) ?? null,
      reason: "NO_PAYMENT_INSTRUMENT" as const,
      billingAccountStatus: a.status,
    })),
    ...orgsMissingBillingAccount.map((orgId) => ({
      organizationId: orgId,
      organizationName: nameByOrgId.get(orgId) ?? null,
      reason: "NO_BILLING_ACCOUNT" as const,
      billingAccountStatus: null,
    })),
  ];

  const orgsWaitingForBillingSetup: OrgWaitingForBillingSetupRow[] = [
    ...orgsWaitingNoSubscription.map((c) => ({
      organizationId: c.id,
      organizationName: c.name,
      billingSetupStatus: c.billingSetupStatus,
      subscriptionStatus: null,
    })),
    ...incompleteSubscriptions.map((s) => ({
      organizationId: s.organizationId,
      organizationName: nameByOrgId.get(s.organizationId) ?? null,
      billingSetupStatus: null,
      subscriptionStatus: s.status,
    })),
  ];

  return {
    trialsMissingFinixDates: trialsMissingDates.map((s) => ({
      subscriptionId: s.id,
      organizationId: s.organizationId,
      organizationName: nameByOrgId.get(s.organizationId) ?? null,
      trialStartsAt: s.trialStartsAt,
      trialEndsAt: s.trialEndsAt,
      createdAt: s.createdAt,
    })),
    failedCharges: failedCharges.map((c) => ({
      chargeId: c.id,
      organizationId: c.organizationId,
      organizationName: nameByOrgId.get(c.organizationId) ?? null,
      billingPeriod: c.billingPeriod,
      amountCents: c.amountCents,
      failureCode: c.failureCode,
      failureMessage: c.failureMessage,
      attemptedAt: c.attemptedAt,
    })),
    retryGroups: failedChargeGroups
      .filter((g) => g._count._all > 1)
      .map((g) => ({
        organizationId: g.organizationId,
        organizationName: nameByOrgId.get(g.organizationId) ?? null,
        billingPeriod: g.billingPeriod,
        failedCount: g._count._all,
      }))
      .sort((a, b) => b.failedCount - a.failedCount),
    routingMismatches,
    unprocessedWebhooks: unprocessedWebhooks.map((w) => ({
      webhookEventId: w.id,
      finixEventId: w.finixEventId,
      type: w.type,
      processingStatus: w.processingStatus,
      errorMessage: w.errorMessage,
      createdAt: w.createdAt,
    })),
    stalePastDue: stalePastDueSubs.map((s) => ({
      subscriptionId: s.id,
      organizationId: s.organizationId,
      organizationName: nameByOrgId.get(s.organizationId) ?? null,
      pastDueAt: s.pastDueAt,
      gracePeriodEndsAt: s.gracePeriodEndsAt,
    })),
    missingBillingInstruments,
    duplicateReferences,
    promotionsEndingSoon: promotionsEndingSoon.map((p) => ({
      entitlementId: p.id,
      organizationId: p.organizationId,
      organizationName: nameByOrgId.get(p.organizationId) ?? null,
      source: p.source,
      endsAt: p.endsAt,
    })),
    orgsWaitingForBillingSetup,
  };
}
