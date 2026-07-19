import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettingsPermissions } from "@/lib/settings/settingsPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requireFullOrganizationContext } from "@/lib/auth";
import { isAuthError } from "@/lib/auth/errors";

// Account closure is existential/irreversible — OWNER-only
// (canRequestAccountClosure is not composable by ADMIN, see
// settingsPermissions.ts) and never available while viewing another
// user's scope.
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSettingsPermissions(auth.rawRole);
  if (!permissions.canRequestAccountClosure) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  const description = reason || "The organization has requested account closure via Settings > Data & Privacy.";

  const ticket = await prisma.supportTicket.create({
    data: {
      churchId: auth.churchId,
      subject: "Account Closure Request",
      category: "OTHER",
      description,
      priority: "HIGH",
      createdByUserId: auth.userId,
      createdByEmail: auth.email,
    },
  });

  await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: auth.rawRole,
      senderUserId: auth.userId,
      senderEmail: auth.email,
      body: description,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "settings.account_closure_requested",
    entityType: "support_ticket",
    entityId: ticket.id,
    req,
  });

  return NextResponse.json({ success: true, ticketId: ticket.id });
}
