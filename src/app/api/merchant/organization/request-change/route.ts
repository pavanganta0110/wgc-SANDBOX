import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth";
import { isAuthError } from "@/lib/auth/errors";
import { createSupportTicketWithNumber } from "@/lib/support/ticketNumber";
import { notifyNewSupportTicket } from "@/lib/support/ticketNotifications";

const VALID_AREAS: Record<string, string> = {
  LEGAL_NAME: "Legal Business Name Change",
  TAX_ID: "Tax ID Update",
  LEGAL_ADDRESS: "Legal/Business Address Change",
  OWNERSHIP: "Ownership/Principal Information Change",
  ORGANIZATION_TYPE: "Organization Type Change",
  BANK_ACCOUNT: "Bank Account Update",
};

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getOrganizationPermissions(auth.rawRole);
  try {
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const area = typeof body.area === "string" ? body.area : "";
  const details = typeof body.details === "string" ? body.details.trim() : "";

  if (!VALID_AREAS[area]) {
    return NextResponse.json({ error: "Invalid change area" }, { status: 400 });
  }
  if (area === "BANK_ACCOUNT" && !permissions.canUpdateBankAccount) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (area !== "BANK_ACCOUNT" && !permissions.canRequestRestrictedChange) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!details) {
    return NextResponse.json({ error: "Please describe the change you're requesting" }, { status: 400 });
  }

  const ticket = await createSupportTicketWithNumber({
    churchId: auth.churchId,
    subject: VALID_AREAS[area],
    category: area === "BANK_ACCOUNT" ? "ACCOUNT_ACCESS" : "VERIFICATION",
    description: details,
    priority: "NORMAL",
    createdByUserId: auth.userId,
    createdByEmail: auth.email,
  });
  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: auth.rawRole,
      senderUserId: auth.userId,
      senderEmail: auth.email,
      body: details,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "organization.restricted_change_requested",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { area, ticketNumber: ticket.ticketNumber },
    req,
  });

  await notifyNewSupportTicket(ticket);

  return NextResponse.json({ success: true, ticketId: ticket.id }, { status: 201 });
}
