import { prisma } from "@/lib/prisma";
import { advancePayoutAccountStatus } from "@/lib/organization/bankAccountStatus";
import { logDashboardAction } from "@/lib/dashboardAudit";

const TERMINAL_STATUSES = new Set(["ACTIVE_FOR_FUTURE_PAYOUTS", "REPLACED", "REJECTED", "FAILED"]);

/**
 * Called whenever an account first reaches VERIFIED, from either the
 * PAYMENT_INSTRUMENT webhook handler or the reconciliation fallback below.
 * No confirmed Finix API exists in this codebase to detect or trigger
 * "this instrument is now the seller's active payout destination," so
 * instead of fabricating ACTIVE_FOR_FUTURE_PAYOUTS this auto-creates a
 * support exception — an automatic alert, not a routine approval queue —
 * so WGC can confirm activation once, out of band, per account.
 */
export async function flagPayoutAccountVerifiedForActivationConfirmation(churchId: string, account: { id: string; last4: string | null; supportTicketId: string | null }) {
  const existingTicket = account.supportTicketId
    ? await prisma.supportTicket.findUnique({ where: { id: account.supportTicketId } })
    : null;

  if (!existingTicket || existingTicket.status === "CLOSED" || existingTicket.status === "RESOLVED") {
    const ticket = await prisma.supportTicket.create({
      data: {
        churchId,
        subject: "Payout bank account verified — activation confirmation needed",
        category: "ACCOUNT_ACCESS",
        priority: "HIGH",
        description:
          `A new payout bank account (••••${account.last4 || "----"}) has been verified by the processor. ` +
          `WGC could not confirm via API that this account is now the organization's active payout destination — ` +
          `please confirm activation status directly with the processor and mark it active for future payouts once confirmed.`,
      },
    });
    await prisma.supportTicketMessage.create({
      data: { ticketId: ticket.id, senderRole: "system", body: "Auto-created after processor verification.", isSystemEvent: true },
    });
    await prisma.organizationBankAccount.update({
      where: { id: account.id },
      data: { supportTicketId: ticket.id, verificationMethod: "SUPPORT_REVIEW" },
    });
  }

  await logDashboardAction({
    churchId,
    action: "organization.payout_account_verified",
    entityType: "organization_bank_account",
    entityId: account.id,
    metadata: { lastFour: account.last4 },
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId,
    eventKey: "BANK_ACCOUNT_CHANGE_SUBMITTED",
    subject: "Payout bank account approved",
    title: "Payout Bank Account Approved",
    badgeText: "Approved",
    badgeColor: "#059669",
    bodyHtml: `<p>Your new payout bank account ending in <strong>${account.last4 || "----"}</strong> has been approved. WGC is confirming activation as your future payout destination.</p>`,
  });
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
    if (TERMINAL_STATUSES.has(previousStatus)) {
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
    const becameVerified = newStatus === "VERIFIED" && previousStatus !== "VERIFIED";

    await prisma.organizationBankAccount.update({
      where: { id: account.id },
      data: {
        status: newStatus,
        processorState: instrument.enabled ? "ENABLED" : instrument.disabled_code ? "DISABLED" : "PENDING",
        failureCode: instrument.disabled_code ?? undefined,
        failureMessageSafe: instrument.disabled_message ?? undefined,
        verifiedAt: becameVerified ? new Date() : undefined,
        reviewStartedAt: newStatus === "UNDER_REVIEW" && !account.reviewStartedAt ? new Date() : undefined,
        validationStartedAt: newStatus === "VALIDATION_PENDING" && !account.validationStartedAt ? new Date() : undefined,
        rejectedAt: newStatus === "REJECTED" ? new Date() : undefined,
        lastSyncedAt: new Date(),
        retryCount: { increment: 1 },
      },
    });

    if (becameVerified) {
      await flagPayoutAccountVerifiedForActivationConfirmation(churchId, account);
    }

    results.push({ id: account.id, previousStatus, newStatus, checked: true });
  }

  return results;
}
