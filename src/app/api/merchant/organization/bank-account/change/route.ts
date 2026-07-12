import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Creates the new bank instrument in Finix directly from the client-side
 * tokenized value (the same createPaymentInstrument({identity, token, type:
 * "TOKEN"}) pattern already used and confirmed by the donor setup-link flow
 * — see src/app/api/setup/[token]/complete/route.ts). Raw account/routing
 * numbers never reach this server; Finix.js's hosted iframe form tokenizes
 * them client-side, and the token itself is never persisted (only used once
 * here, then discarded).
 *
 * No WGC approval step happens here — this is the automated normal path.
 * The new instrument is created under the org's existing seller Identity
 * (never a new Identity, never another org's), stored as SUBMITTED, and
 * status advances automatically from real Finix signals (webhook +
 * reconciliation). A support ticket is only auto-created later, once
 * verified, if WGC can't confirm activation via API — see
 * flagPayoutAccountVerifiedForActivationConfirmation.
 */
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canUpdateBankAccount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const finixToken = typeof body.finixToken === "string" ? body.finixToken : "";
  const changeReason = typeof body.changeReason === "string" ? body.changeReason.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : `payout-change-${session.churchId}-${Date.now()}`;
  const consentSnapshot = typeof body.consentSnapshot === "string" ? body.consentSnapshot : "";
  if (!finixToken) {
    return NextResponse.json({ error: "Missing tokenized bank details" }, { status: 400 });
  }

  // Idempotency: if this exact request was already submitted (e.g. a
  // duplicate click or a retried network request), return the original
  // result instead of creating a second payout account.
  const existingRequest = await prisma.payoutAccountChangeRequest.findUnique({ where: { idempotencyKey } });
  if (existingRequest?.proposedAccountId) {
    const existingAccount = await prisma.organizationBankAccount.findUnique({ where: { id: existingRequest.proposedAccountId } });
    if (existingAccount) {
      return NextResponse.json(
        { account: { id: existingAccount.id, last4: existingAccount.last4, accountType: existingAccount.accountType, status: existingAccount.status }, idempotent: true },
        { status: 200 }
      );
    }
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixIdentityId: true, name: true } });
  if (!church?.finixIdentityId) {
    return NextResponse.json({ error: "This organization does not have a processor identity configured yet" }, { status: 400 });
  }

  const current = await resolveActiveBankAccount(session.churchId);

  const changeRequest = await prisma.payoutAccountChangeRequest.upsert({
    where: { idempotencyKey },
    create: {
      churchId: session.churchId,
      requestedByUserId: session.userId,
      state: "SUBMITTED",
      idempotencyKey,
      consentSnapshot: consentSnapshot || null,
    },
    update: {},
  });

  const { finixClient } = await import("@/lib/finix/client");
  let instrument;
  try {
    instrument = await finixClient.createPaymentInstrument({ identity: church.finixIdentityId, token: finixToken, type: "TOKEN" });
  } catch (err) {
    console.error("Bank instrument creation failed:", err);
    await prisma.payoutAccountChangeRequest.update({ where: { id: changeRequest.id }, data: { state: "FAILED", failedAt: new Date() } });
    return NextResponse.json({ error: "We couldn't process those bank details. Please check them and try again." }, { status: 502 });
  }
  if (!instrument?.id) {
    await prisma.payoutAccountChangeRequest.update({ where: { id: changeRequest.id }, data: { state: "FAILED", failedAt: new Date() } });
    return NextResponse.json({ error: "We couldn't process those bank details. Please try again." }, { status: 502 });
  }

  const newAccount = await prisma.organizationBankAccount.create({
    data: {
      churchId: session.churchId,
      finixPaymentInstrumentId: instrument.id,
      sellerIdentityId: church.finixIdentityId,
      accountHolderName: instrument.name ?? null,
      last4: instrument.masked_account_number ?? null,
      accountType: instrument.account_type ?? null,
      status: "SUBMITTED",
      processorState: instrument.enabled ? "ENABLED" : "PENDING",
      isActiveDestination: false,
      createdByUserId: session.userId,
      changeReason: changeReason || null,
      verificationMethod: "PROCESSOR_REVIEW",
    },
  });

  await prisma.payoutAccountChangeRequest.update({
    where: { id: changeRequest.id },
    data: {
      currentAccountId: current?.organizationBankAccountId ?? null,
      proposedAccountId: newAccount.id,
      processorRequestReference: instrument.id,
      state: "SUBMITTED",
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.payout_account_change_submitted",
    entityType: "organization_bank_account",
    entityId: newAccount.id,
    metadata: {
      oldLastFour: current?.last4 ?? null,
      newLastFour: instrument.masked_account_number ?? null,
      changeRequestId: changeRequest.id,
    },
    req,
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId: session.churchId,
    eventKey: "BANK_ACCOUNT_CHANGE_SUBMITTED",
    subject: "Payout bank account change submitted",
    title: "Payout Bank Account Submitted",
    badgeText: "Under Review",
    badgeColor: "#D97706",
    bodyHtml: `<p>A payout bank account change was submitted for <strong>${church.name}</strong> and is now under review. Your current payout account remains active until the new account is approved.</p>`,
  });

  return NextResponse.json(
    {
      account: { id: newAccount.id, last4: newAccount.last4, accountType: newAccount.accountType, status: newAccount.status },
      changeRequestId: changeRequest.id,
    },
    { status: 201 }
  );
}
