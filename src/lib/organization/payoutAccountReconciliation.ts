import { prisma } from "@/lib/prisma";
import { advancePayoutAccountStatus, isTerminalPayoutAccountStatus, resolveVerificationState, resolvePaymentInstrumentState } from "@/lib/organization/bankAccountStatus";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { createSupportTicketWithNumber } from "@/lib/support/ticketNumber";
import { notifyNewSupportTicket } from "@/lib/support/ticketNotifications";

/**
 * Called whenever an account first reaches APPROVED, from either the
 * PAYMENT_INSTRUMENT webhook handler or the reconciliation fallback below.
 * Always tries the automatic activation plug-in point first
 * (attemptAutomaticPayoutDestinationActivation) — today that always
 * reports PROCESSOR_PERMISSION_REQUIRED since no confirmed Finix API
 * exists to change the payout destination, so this falls through to an
 * auto-created support exception (an automatic alert, not a routine
 * approval queue) so WGC can confirm activation once, out of band.
 */
export async function flagPayoutAccountVerifiedForActivationConfirmation(
  churchId: string,
  account: { id: string; last4: string | null; supportTicketId: string | null; finixPaymentInstrumentId?: string | null; sellerIdentityId?: string | null }
) {
  const { attemptAutomaticPayoutDestinationActivation, activatePayoutDestination } = await import("@/lib/organization/payoutDestinationActivation");
  const automatic = await attemptAutomaticPayoutDestinationActivation(churchId, {
    id: account.id,
    finixPaymentInstrumentId: account.finixPaymentInstrumentId ?? null,
    sellerIdentityId: account.sellerIdentityId ?? null,
  });
  if (automatic.automated) {
    await activatePayoutDestination(churchId, account.id, "system");
    return;
  }

  const existingTicket = account.supportTicketId
    ? await prisma.supportTicket.findUnique({ where: { id: account.supportTicketId } })
    : null;

  if (!existingTicket || existingTicket.status === "CLOSED" || existingTicket.status === "RESOLVED") {
    const ticket = await createSupportTicketWithNumber({
      churchId,
      subject: "Payout bank account approved — activation confirmation needed",
      category: "ACCOUNT_ACCESS",
      priority: "HIGH",
      description:
        `A new payout bank account (••••${account.last4 || "----"}) has been approved by the processor. ` +
        `WGC could not confirm via API that this account is now the organization's active payout destination — ` +
        `please confirm activation status directly with the processor and mark it active for future payouts once confirmed.`,
    });
    await prisma.supportTicketMessage.create({
      data: { ticketId: ticket.id, senderRole: "system", body: "Auto-created after processor approval.", isSystemEvent: true },
    });
    await prisma.organizationBankAccount.update({
      where: { id: account.id },
      data: { supportTicketId: ticket.id, verificationMethod: "SUPPORT_REVIEW" },
    });
    await notifyNewSupportTicket(ticket);
  }

  await logDashboardAction({
    churchId,
    action: "organization.payout_account_approved",
    entityType: "organization_bank_account",
    entityId: account.id,
    metadata: { lastFour: account.last4 },
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId,
    eventKey: "PAYOUT_ACCOUNT_APPROVED",
    subject: "Payout bank account approved",
    title: "Payout Bank Account Approved",
    badgeText: "Approved",
    badgeColor: "#059669",
    bodyHtml: `<p>Your new payout bank account ending in <strong>${account.last4 || "----"}</strong> has been approved. WGC is confirming activation as your future payout destination.</p>`,
  });
}

export async function notifyPayoutAccountStatusTransition(churchId: string, accountId: string, last4: string | null, newStatus: string, failureMessageSafe: string | null | undefined) {
  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");

  if (newStatus === "UNDER_REVIEW") {
    await logDashboardAction({ churchId, action: "organization.payout_review_started", entityType: "organization_bank_account", entityId: accountId, metadata: { lastFour: last4 } });
    await notifyEvent({
      churchId,
      eventKey: "PAYOUT_ACCOUNT_UNDER_REVIEW",
      subject: "Payout bank account under review",
      title: "Payout Bank Account Under Review",
      badgeText: "Under Review",
      badgeColor: "#D97706",
      bodyHtml: `<p>Your payout bank account ending in <strong>${last4 || "----"}</strong> is under processor review. Your current payout account remains active until this is approved.</p>`,
    });
  } else if (newStatus === "REQUIRES_ACTION") {
    await logDashboardAction({ churchId, action: "organization.payout_documents_required", entityType: "organization_bank_account", entityId: accountId, metadata: { lastFour: last4, reason: failureMessageSafe ?? null } });
    await notifyEvent({
      churchId,
      eventKey: "PAYOUT_ACCOUNT_DOCUMENTS_REQUIRED",
      subject: "Action required on your payout bank account",
      title: "Payout Bank Account Requires Action",
      badgeText: "Requires Action",
      badgeColor: "#DC2626",
      bodyHtml: `<p>Additional information is required before your payout bank account ending in <strong>${last4 || "----"}</strong> can become active.${failureMessageSafe ? ` ${failureMessageSafe}` : ""}</p>`,
    });
  } else if (newStatus === "REJECTED") {
    await logDashboardAction({ churchId, action: "organization.payout_account_rejected", entityType: "organization_bank_account", entityId: accountId, metadata: { lastFour: last4 } });
    await notifyEvent({
      churchId,
      eventKey: "PAYOUT_ACCOUNT_REJECTED",
      subject: "Payout bank account could not be approved",
      title: "Payout Bank Account Rejected",
      badgeText: "Rejected",
      badgeColor: "#DC2626",
      bodyHtml: `<p>The payout bank account ending in <strong>${last4 || "----"}</strong> could not be approved. Review the information or contact WGC Support.</p>`,
    });
  }
}

/**
 * Webhooks are the primary update mechanism (see the PAYMENT_INSTRUMENT
 * block in the Finix webhook handler). This is the fallback: for any
 * organization's non-terminal payout-account rows, re-fetch the instrument
 * from Finix directly and advance local status if it changed. Never resets
 * a populated field to null on a partial response.
 */
export async function reconcilePendingPayoutAccountsForChurch(churchId: string) {
  const pending = await prisma.organizationBankAccount.findMany({
    where: { churchId, finixPaymentInstrumentId: { not: null } },
  });

  const { finixClient } = await import("@/lib/finix/client");
  const results: { id: string; previousStatus: string; newStatus: string; checked: boolean }[] = [];

  for (const account of pending) {
    const previousStatus = account.status;
    if (isTerminalPayoutAccountStatus(previousStatus)) {
      results.push({ id: account.id, previousStatus, newStatus: previousStatus, checked: false });
      continue;
    }

    let instrument;
    try {
      instrument = await finixClient.getPaymentInstrument(account.finixPaymentInstrumentId!);
    } catch (err) {
      console.error(`Reconciliation: failed to fetch payment instrument ${account.finixPaymentInstrumentId}:`, err);
      await prisma.organizationBankAccount.update({
        where: { id: account.id },
        data: { retryCount: { increment: 1 }, lastSyncedAt: new Date() },
      });
      results.push({ id: account.id, previousStatus, newStatus: previousStatus, checked: true });
      continue;
    }

    const newStatus = advancePayoutAccountStatus(previousStatus, instrument);
    const becameApproved = newStatus === "APPROVED" && previousStatus !== "APPROVED";
    const statusChanged = newStatus !== previousStatus;

    await prisma.organizationBankAccount.update({
      where: { id: account.id },
      data: {
        status: newStatus,
        paymentInstrumentState: resolvePaymentInstrumentState(instrument),
        verificationState: resolveVerificationState(instrument, newStatus),
        failureCode: instrument.disabled_code ?? undefined,
        failureMessageSafe: instrument.disabled_message ?? undefined,
        verifiedAt: becameApproved ? new Date() : undefined,
        reviewStartedAt: newStatus === "UNDER_REVIEW" && !account.reviewStartedAt ? new Date() : undefined,
        validationStartedAt: newStatus === "PENDING_VERIFICATION" && !account.validationStartedAt ? new Date() : undefined,
        rejectedAt: newStatus === "REJECTED" ? new Date() : undefined,
        lastSyncedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });

    if (becameApproved) {
      await flagPayoutAccountVerifiedForActivationConfirmation(churchId, account);
    } else if (statusChanged) {
      await notifyPayoutAccountStatusTransition(churchId, account.id, account.last4, newStatus, instrument.disabled_message);
    }

    results.push({ id: account.id, previousStatus, newStatus, checked: true });
  }

  return results;
}
