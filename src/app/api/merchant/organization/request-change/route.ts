import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getOrganizationPermissions } from "@/lib/organization/organizationPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

const VALID_AREAS: Record<string, string> = {
  LEGAL_NAME: "Legal Business Name Change",
  TAX_ID: "Tax ID Update",
  LEGAL_ADDRESS: "Legal/Business Address Change",
  OWNERSHIP: "Ownership/Principal Information Change",
  ORGANIZATION_TYPE: "Organization Type Change",
  BANK_ACCOUNT: "Bank Account Update",
};

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getOrganizationPermissions(session?.role);
  if (!session || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const ticket = await prisma.supportTicket.create({
    data: {
      churchId: session.churchId,
      subject: VALID_AREAS[area],
      category: area === "BANK_ACCOUNT" ? "ACCOUNT_ACCESS" : "VERIFICATION",
      description: details,
      priority: "NORMAL",
      createdByUserId: session.userId,
      createdByEmail: session.email,
    },
  });

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: session.role,
      senderUserId: session.userId,
      senderEmail: session.email,
      body: details,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "organization.restricted_change_requested",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { area },
    req,
  });

  return NextResponse.json({ success: true, ticketId: ticket.id }, { status: 201 });
}
