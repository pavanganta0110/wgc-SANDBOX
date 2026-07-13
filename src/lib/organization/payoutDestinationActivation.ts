import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";

export interface AutomaticActivationResult {
  automated: boolean;
  reason: "ACTIVATED" | "PROCESSOR_PERMISSION_REQUIRED" | "SYNC_FAILED";
}

/**
 * The single plug-in point for automatic payout-destination activation.
 * Today this always returns `automated: false` — no confirmed Finix API
 * exists in this codebase to change which bank Payment Instrument a
 * merchant's Payout Profile points to (GET /payout_profiles/{id} is new
 * and read-only; its write shape, and whether WGC's credentials can write
 * to it at all, is unconfirmed — see syncPayoutProfileForChurch).
 *
 * When Finix confirms a real activation endpoint, only the body of this
 * function needs to change (call the real API, and on success call
 * activatePayoutDestination() below) — every caller (webhook,
 * reconciliation, the exception-path route) already calls through here,
 * so no other part of the workflow needs to change.
 */
export async function attemptAutomaticPayoutDestinationActivation(
  churchId: string,
  account: { id: string; finixPaymentInstrumentId: string | null; sellerIdentityId: string | null }
): Promise<AutomaticActivationResult> {
  try {
    const church = await prisma.church.findUnique({ where: { id: churchId }, select: { finixMerchantId: true } });
    if (church?.finixMerchantId) {
      const { syncPayoutProfileForChurch } = await import("@/lib/finix/sync/syncPayoutProfile");
      // Best-effort inspection only — never throws the caller off course,
      // and never used to decide activation until its response shape (and
      // write capability) is confirmed.
      await syncPayoutProfileForChurch(churchId, church.finixMerchantId).catch(() => null);
    }
  } catch {
    // Inspection is diagnostic only — a failure here must never block the
    // real fallback (the exception ticket) from being created.
  }

  // -- PLUG-IN POINT --
  // No confirmed Finix API exists to change the payout destination. Once
  // one is confirmed (e.g. PATCH /payout_profiles/{id} with a bank
  // Payment Instrument reference), replace this block with that call and
  // `return { automated: true, reason: "ACTIVATED" }` on success — calling
  // activatePayoutDestination(churchId, account.id, "system") to finalize
  // the same local state transition the manual exception path uses today.
  return { automated: false, reason: "PROCESSOR_PERMISSION_REQUIRED" };
}

/**
 * The actual local activation transaction — demotes the previous active
 * account to HISTORICAL, promotes the new one to ACTIVE, closes out the
 * linked change request, audits, and notifies. Shared by both the manual
 * exception-path route (wgc_admin) and, in the future, the automatic path
 * above once Finix confirms a real activation API — so the state
 * transition itself never needs to be redesigned, only how it gets
 * triggered.
 */
export async function activatePayoutDestination(
  churchId: string,
  newAccountId: string,
  activatedBy: { userId?: string | null; email?: string | null; role?: string | null } | "system"
) {
  const newAccount = await prisma.organizationBankAccount.findUnique({ where: { id: newAccountId } });
  if (!newAccount || newAccount.churchId !== churchId) {
    throw new Error("Payout account not found for this organization");
  }
  if (newAccount.isActiveDestination) {
    return { alreadyActive: true };
  }
  // Never skip review: only an account that has actually reached APPROVED
  // (i.e. verified by the processor) may become the active destination —
  // this also prevents reactivating a HISTORICAL/REJECTED/DISABLED account
  // without going through SUBMITTED -> ... -> APPROVED again.
  if (newAccount.status !== "APPROVED") {
    throw new Error(`Payout account must be APPROVED before activation (current status: ${newAccount.status})`);
  }

  const previousActive = await prisma.organizationBankAccount.findFirst({
    where: { churchId, isActiveDestination: true },
  });

  const now = new Date();
  await prisma.$transaction([
    ...(previousActive
      ? [
          prisma.organizationBankAccount.update({
            where: { id: previousActive.id },
            data: { isActiveDestination: false, status: "HISTORICAL", replacedAt: now, replacedByAccountId: newAccount.id },
          }),
        ]
      : []),
    prisma.organizationBankAccount.update({
      where: { id: newAccount.id },
      data: { isActiveDestination: true, status: "ACTIVE", activatedAt: now },
    }),
    prisma.payoutAccountChangeRequest.updateMany({
      where: { proposedAccountId: newAccount.id },
      data: { state: "ACTIVATED", completedAt: now },
    }),
  ]);

  const actor = activatedBy === "system" ? { actorUserId: null, actorEmail: null, actorRole: "system" } : { actorUserId: activatedBy.userId, actorEmail: activatedBy.email, actorRole: activatedBy.role };

  await logDashboardAction({
    churchId,
    ...actor,
    action: "organization.payout_account_activated",
    entityType: "organization_bank_account",
    entityId: newAccount.id,
    metadata: { previousAccountId: previousActive?.id ?? null, newLastFour: newAccount.last4, oldLastFour: previousActive?.last4 ?? null, activatedBy: activatedBy === "system" ? "system" : "wgc_admin" },
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId,
    eventKey: "PAYOUT_ACCOUNT_ACTIVATED",
    subject: "Your new payout bank account is now active",
    title: "Payout Bank Account Active",
    badgeText: "Active",
    badgeColor: "#059669",
    bodyHtml: `<p>Your new payout bank account ending in <strong>${newAccount.last4 || "----"}</strong> is now active for future eligible payouts. Payouts already scheduled or processing may continue to the previous account.</p>`,
  });

  if (previousActive) {
    await logDashboardAction({
      churchId,
      ...actor,
      action: "organization.payout_account_archived",
      entityType: "organization_bank_account",
      entityId: previousActive.id,
      metadata: { lastFour: previousActive.last4, replacedByAccountId: newAccount.id },
    });
    await notifyEvent({
      churchId,
      eventKey: "PAYOUT_ACCOUNT_REPLACED",
      subject: "Your previous payout bank account was moved to history",
      title: "Payout Bank Account Replaced",
      badgeText: "Historical",
      badgeColor: "#64748B",
      bodyHtml: `<p>Your previous payout bank account ending in <strong>${previousActive.last4 || "----"}</strong> is no longer active and has been moved to Bank Account History.</p>`,
    });
  }

  return { alreadyActive: false, previousAccountId: previousActive?.id ?? null };
}
