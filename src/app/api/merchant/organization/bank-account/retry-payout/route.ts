import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Retries a failed payout using Finix's documented failed-settlement-funding
 * recovery flow: PUT /settlements/{id} with a destination bank instrument +
 * rail. This creates a NEW credit funding transfer — it never rewrites the
 * failed historical one (see FinixFundingTransferAttempt, which is never
 * mutated by this route beyond flagging it as retried).
 *
 * Retry only runs against the organization's current ACTIVE payout
 * account, requires explicit admin confirmation from the
 * client, and is idempotent per funding-transfer-attempt via a retry marker.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpdateBankAccount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const fundingTransferAttemptId = typeof body.fundingTransferAttemptId === "string" ? body.fundingTransferAttemptId : "";
  if (!fundingTransferAttemptId) {
    return NextResponse.json({ error: "Missing deposit reference" }, { status: 400 });
  }

  const attempt = await prisma.finixFundingTransferAttempt.findUnique({ where: { id: fundingTransferAttemptId } });
  if (!attempt || attempt.churchId !== session.churchId) {
    return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
  }
  if (attempt.state !== "FAILED" && attempt.state !== "RETURNED") {
    return NextResponse.json({ error: "Only a failed or returned payout can be retried" }, { status: 400 });
  }
  if (!attempt.finixSettlementId) {
    return NextResponse.json({ error: "This payout has no associated settlement to retry" }, { status: 400 });
  }
  // Idempotency: refuse a second retry attempt for the same failed payout
  // within a short window rather than firing duplicate settlement retries.
  if (attempt.retriedAt && Date.now() - attempt.retriedAt.getTime() < 5 * 60 * 1000) {
    return NextResponse.json({ error: "A retry for this payout was already submitted recently" }, { status: 409 });
  }

  const activeAccount = await prisma.organizationBankAccount.findFirst({
    where: { churchId: session.churchId, isActiveDestination: true },
  });
  if (!activeAccount?.finixPaymentInstrumentId) {
    return NextResponse.json({ error: "No active, verified payout bank account is on file to retry this payout to" }, { status: 400 });
  }
  if (activeAccount.status !== "ACTIVE") {
    return NextResponse.json({ error: "The current payout account is not yet active — resolve that before retrying" }, { status: 400 });
  }

  const { finixClient } = await import("@/lib/finix/client");
  try {
    await finixClient.retrySettlementFundingTransfer(attempt.finixSettlementId, activeAccount.finixPaymentInstrumentId, "ACH");
  } catch (err) {
    console.error("Payout retry failed:", err);
    return NextResponse.json({ error: "We couldn't retry this payout. Please contact WGC Support." }, { status: 502 });
  }

  await prisma.finixFundingTransferAttempt.update({
    where: { id: attempt.id },
    data: { retriedAt: new Date(), retriedByUserId: session.userId },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.payout_retry_requested",
    entityType: "funding_transfer_attempt",
    entityId: attempt.id,
    metadata: { settlementId: attempt.finixSettlementId, destinationLastFour: activeAccount.last4 },
    req,
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId: session.churchId,
    eventKey: "PAYOUT_DEPOSIT_DELAYED",
    subject: "Payout retry submitted",
    title: "Payout Retry Submitted",
    badgeText: "Retrying",
    badgeColor: "#0B5DBC",
    bodyHtml: `<p>A retry was submitted for a failed payout, using your current payout bank account ending in <strong>${activeAccount.last4 || "----"}</strong>.</p>`,
  });

  return NextResponse.json({ success: true });
}
