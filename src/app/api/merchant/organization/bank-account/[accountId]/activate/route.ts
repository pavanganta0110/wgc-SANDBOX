import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Exception-path activation only — not a routine approval step. The normal
 * path (SUBMITTED -> PENDING_VERIFICATION -> UNDER_REVIEW -> APPROVED) is
 * fully automated via webhooks/reconciliation. This route exists because
 * there is no confirmed Finix API in this codebase to detect or trigger
 * "this instrument is now the active payout destination," so once an
 * account is APPROVED, WGC support confirms activation once out of band
 * (via the auto-created exception ticket) and calls this to finalize it.
 * An organization can go through this flow any number of times — every
 * previously active account is preserved as HISTORICAL, never deleted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const session = await getSession();
  if (!session || session.role !== "wgc_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const newAccount = await prisma.organizationBankAccount.findUnique({ where: { id: accountId } });
  if (!newAccount || newAccount.churchId !== session.churchId) {
    return NextResponse.json({ error: "Bank account not found" }, { status: 404 });
  }
  if (newAccount.isActiveDestination) {
    return NextResponse.json({ error: "This account is already active" }, { status: 400 });
  }

  const previousActive = await prisma.organizationBankAccount.findFirst({
    where: { churchId: session.churchId, isActiveDestination: true },
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

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.payout_account_activated",
    entityType: "organization_bank_account",
    entityId: newAccount.id,
    metadata: { previousAccountId: previousActive?.id ?? null, newLastFour: newAccount.last4, oldLastFour: previousActive?.last4 ?? null },
    req,
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId: session.churchId,
    eventKey: "PAYOUT_ACCOUNT_ACTIVATED",
    subject: "Your new payout bank account is now active",
    title: "Payout Bank Account Active",
    badgeText: "Active",
    badgeColor: "#059669",
    bodyHtml: `<p>Your new payout bank account ending in <strong>${newAccount.last4 || "----"}</strong> is now active for future eligible payouts. Payouts already scheduled or processing may continue to the previous account.</p>`,
  });

  if (previousActive) {
    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "organization.payout_account_archived",
      entityType: "organization_bank_account",
      entityId: previousActive.id,
      metadata: { lastFour: previousActive.last4, replacedByAccountId: newAccount.id },
      req,
    });
    await notifyEvent({
      churchId: session.churchId,
      eventKey: "PAYOUT_ACCOUNT_REPLACED",
      subject: "Your previous payout bank account was moved to history",
      title: "Payout Bank Account Replaced",
      badgeText: "Historical",
      badgeColor: "#64748B",
      bodyHtml: `<p>Your previous payout bank account ending in <strong>${previousActive.last4 || "----"}</strong> is no longer active and has been moved to Bank Account History.</p>`,
    });
  }

  return NextResponse.json({ success: true });
}
