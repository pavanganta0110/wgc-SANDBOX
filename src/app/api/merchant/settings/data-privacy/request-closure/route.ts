import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getSettingsPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canRequestAccountClosure) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const description = reason || "The organization has requested account closure via Settings > Data & Privacy.";

  const ticket = await prisma.supportTicket.create({
    data: {
      churchId: session.churchId,
      subject: "Account Closure Request",
      category: "OTHER",
      description,
      priority: "HIGH",
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
      body: description,
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "settings.account_closure_requested",
    entityType: "support_ticket",
    entityId: ticket.id,
    req,
  });

  return NextResponse.json({ success: true, ticketId: ticket.id });
}
