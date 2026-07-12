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
 * them client-side.
 *
 * There is no confirmed Finix API in this codebase to reassign a merchant's
 * payout/funding destination, so the new instrument is stored as PENDING
 * and NOT made the active destination here — a WGC Support review (tracked
 * via a real support ticket) confirms the change on the processor side,
 * then a separate activate action flips isActiveDestination.
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
  if (!finixToken) {
    return NextResponse.json({ error: "Missing tokenized bank details" }, { status: 400 });
  }

  const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixIdentityId: true, name: true } });
  if (!church?.finixIdentityId) {
    return NextResponse.json({ error: "This organization does not have a processor identity configured yet" }, { status: 400 });
  }

  const current = await resolveActiveBankAccount(session.churchId);

  const { finixClient } = await import("@/lib/finix/client");
  let instrument;
  try {
    instrument = await finixClient.createPaymentInstrument({ identity: church.finixIdentityId, token: finixToken, type: "TOKEN" });
  } catch (err) {
    console.error("Bank instrument creation failed:", err);
    return NextResponse.json({ error: "We couldn't process those bank details. Please check them and try again." }, { status: 502 });
  }
  if (!instrument?.id) {
    return NextResponse.json({ error: "We couldn't process those bank details. Please try again." }, { status: 502 });
  }

  const newAccount = await prisma.organizationBankAccount.create({
    data: {
      churchId: session.churchId,
      finixPaymentInstrumentId: instrument.id,
      accountHolderName: instrument.name ?? null,
      last4: instrument.masked_account_number ?? null,
      accountType: instrument.account_type ?? null,
      status: "PENDING",
      processorState: instrument.enabled ? "ENABLED" : "DISABLED",
      isActiveDestination: false,
      createdByUserId: session.userId,
      changeReason: changeReason || null,
      verificationMethod: "SUPPORT_REVIEW",
    },
  });

  const ticket = await prisma.supportTicket.create({
    data: {
      churchId: session.churchId,
      subject: "Bank Account Change Request",
      category: "ACCOUNT_ACCESS",
      priority: "HIGH",
      description:
        `Organization requested a bank account change.\n\n` +
        `Current account on file: ${current ? `${current.bankName || "Unknown bank"} ••••${current.last4 || "----"}` : "None on file"}\n` +
        `New account submitted: ${instrument.account_type || "Unknown type"} ••••${instrument.masked_account_number || "----"}\n` +
        (changeReason ? `Reason given: ${changeReason}\n` : "") +
        `\nThis request requires manual confirmation on the processor side before the new account becomes the active deposit destination.`,
      createdByUserId: session.userId,
      createdByEmail: session.email,
    },
  });

  await prisma.organizationBankAccount.update({ where: { id: newAccount.id }, data: { supportTicketId: ticket.id } });
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: session.role,
      senderUserId: session.userId,
      senderEmail: session.email,
      body: "Bank account change submitted via Organization Profile.",
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.bank_account_change_submitted",
    entityType: "organization_bank_account",
    entityId: newAccount.id,
    metadata: {
      oldLastFour: current?.last4 ?? null,
      newLastFour: instrument.masked_account_number ?? null,
      supportTicketId: ticket.id,
    },
    req,
  });

  const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
  await notifyEvent({
    churchId: session.churchId,
    eventKey: "BANK_ACCOUNT_CHANGE_SUBMITTED",
    subject: "Bank account change submitted for review",
    title: "Bank Account Change Submitted",
    badgeText: "Under Review",
    badgeColor: "#D97706",
    bodyHtml: `<p>A bank account change was submitted for <strong>${church.name}</strong> and is under review. The current account on file remains the active deposit destination until this change is approved.</p>`,
  });

  return NextResponse.json(
    {
      account: {
        id: newAccount.id,
        last4: newAccount.last4,
        accountType: newAccount.accountType,
        status: newAccount.status,
      },
      ticketId: ticket.id,
    },
    { status: 201 }
  );
}
