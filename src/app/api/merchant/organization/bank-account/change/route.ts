import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { resolveActiveBankAccount } from "@/lib/organization/bankAccountResolver";
import { isTerminalPayoutAccountStatus, resolvePaymentInstrumentState, resolveVerificationState } from "@/lib/organization/bankAccountStatus";
import { PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS } from "@/lib/organization/payoutAccountLimits";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth/viewScope";
import { isAuthError } from "@/lib/auth/errors";

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
 * approved, if WGC can't confirm activation via API — see
 * flagPayoutAccountVerifiedForActivationConfirmation.
 *
 * WGC product policy (not a Finix processor limit): only one non-terminal
 * change request may be in flight per organization at a time, and a
 * processor fingerprint match (when Finix returns one) is treated as a
 * duplicate rather than creating a redundant account row.
 */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  if (!permissions.canUpdateBankAccount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Team-access Checkpoint 4B: bank-account mutations are blocked while
  // viewing another user's scope.
  try {
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const finixToken = typeof body.finixToken === "string" ? body.finixToken : "";
  const changeReason = typeof body.changeReason === "string" ? body.changeReason.trim() : "";
  const idempotencyKey = typeof body.idempotencyKey === "string" && body.idempotencyKey ? body.idempotencyKey : `payout-change-${auth.churchId}-${Date.now()}`;
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

  // WGC product policy (not a Finix processor limit — Finix does not
  // publish a maximum bank-account count): at most
  // PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS change(s) in SUBMITTED,
  // PENDING_VERIFICATION, UNDER_REVIEW, or REQUIRES_ACTION at a time.
  const allNonTerminal = await prisma.organizationBankAccount.findMany({
    where: { churchId: auth.churchId, isActiveDestination: false },
    select: { id: true, status: true, last4: true },
  });
  const pendingAccounts = allNonTerminal.filter((a) => !isTerminalPayoutAccountStatus(a.status));
  if (pendingAccounts.length >= PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS) {
    const pendingAccount = pendingAccounts[0];
    return NextResponse.json(
      { error: `A payout bank account change is already in progress (ending in ••••${pendingAccount.last4 || "----"}). Only ${PAYOUT_ACCOUNT_MAX_PENDING_CHANGE_REQUESTS} change can be reviewed at a time.` },
      { status: 409 }
    );
  }

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { finixIdentityId: true, name: true } });
  if (!church?.finixIdentityId) {
    return NextResponse.json({ error: "This organization does not have a processor identity configured yet" }, { status: 400 });
  }

  const current = await resolveActiveBankAccount(auth.churchId);

  const changeRequest = await prisma.payoutAccountChangeRequest.upsert({
    where: { idempotencyKey },
    create: {
      churchId: auth.churchId,
      requestedByUserId: auth.userId,
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

  // Duplicate check: when Finix returns a fingerprint on the new instrument,
  // treat a match against any prior account for this org as the same bank
  // account already on file, rather than creating a redundant row. The
  // Finix instrument itself was already created at this point (no API to
  // undo that), but we don't compound the duplication locally.
  if (instrument.fingerprint) {
    const duplicate = await prisma.organizationBankAccount.findFirst({
      where: { churchId: auth.churchId, fingerprint: instrument.fingerprint },
    });
    if (duplicate) {
      await prisma.payoutAccountChangeRequest.update({ where: { id: changeRequest.id }, data: { state: "FAILED", failedAt: new Date() } });
      return NextResponse.json(
        { error: `This bank account is already on file (ending in ••••${duplicate.last4 || "----"}, status ${duplicate.status}). No new account was added.` },
        { status: 409 }
      );
    }
  }

  const newStatus = "SUBMITTED";
  const newAccount = await prisma.organizationBankAccount.create({
    data: {
      churchId: auth.churchId,
      finixPaymentInstrumentId: instrument.id,
      sellerIdentityId: church.finixIdentityId,
      fingerprint: instrument.fingerprint ?? null,
      accountHolderName: instrument.name ?? null,
      last4: instrument.masked_account_number ?? null,
      accountType: instrument.account_type ?? null,
      status: newStatus,
      paymentInstrumentState: resolvePaymentInstrumentState(instrument),
      verificationState: resolveVerificationState(instrument, newStatus),
      isActiveDestination: false,
      createdByUserId: auth.userId,
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
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
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
    churchId: auth.churchId,
    eventKey: "PAYOUT_ACCOUNT_SUBMITTED",
    subject: "Payout bank account change submitted",
    title: "Payout Bank Account Submitted",
    badgeText: "Submitted",
    badgeColor: "#D97706",
    bodyHtml: `<p>A payout bank account change was submitted for <strong>${church.name}</strong>. Your new bank account will be used for future eligible payouts after it is approved and activated. Payouts already scheduled or processing may continue to your previous account.</p>`,
  });

  return NextResponse.json(
    {
      account: { id: newAccount.id, last4: newAccount.last4, accountType: newAccount.accountType, status: newAccount.status },
      changeRequestId: changeRequest.id,
    },
    { status: 201 }
  );
}
