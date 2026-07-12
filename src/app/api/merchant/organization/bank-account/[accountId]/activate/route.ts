import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Activating a bank-account change is a WGC Support action, not a
 * self-service Organization Admin one — there is no confirmed Finix API to
 * auto-verify a new payout instrument, so this route exists for the
 * wgc_admin support-context flow only, after the change has been reviewed
 * and confirmed on the processor side outside this app.
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
            data: { isActiveDestination: false, status: "REPLACED", replacedAt: now, replacedByAccountId: newAccount.id },
          }),
        ]
      : []),
    prisma.organizationBankAccount.update({
      where: { id: newAccount.id },
      data: { isActiveDestination: true, status: "ACTIVE", activatedAt: now },
    }),
  ]);

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.bank_account_activated",
    entityType: "organization_bank_account",
    entityId: newAccount.id,
    metadata: { previousAccountId: previousActive?.id ?? null, newLastFour: newAccount.last4, oldLastFour: previousActive?.last4 ?? null },
    req,
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId: session.churchId,
    eventKey: "BANK_ACCOUNT_CHANGE_ACTIVATED",
    subject: "New bank account is now active",
    title: "Bank Account Change Activated",
    badgeText: "Active",
    badgeColor: "#059669",
    bodyHtml: `<p>Your new bank account ending in <strong>${newAccount.last4 || "----"}</strong> is now the active deposit destination. New deposits created after this point will be sent to this account; deposits already in progress on the previous account are unaffected.</p>`,
  });

  return NextResponse.json({ success: true });
}
