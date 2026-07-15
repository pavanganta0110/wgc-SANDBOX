import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { sendYearEndStatementEmail } from "@/lib/donors/generateStatement";

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string; statementId: string }> }) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, statementId } = await params;
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, donorId, churchId: session.churchId } });
  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const isResend = statement.sentAt != null;

  try {
    const result = await sendYearEndStatementEmail(statementId, session.churchId, session.email);

    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: isResend ? "statement.resent" : "statement.emailed",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId, recipientEmail: result.recipientEmail },
      req,
    });

    return NextResponse.json({ success: true, recipientEmail: result.recipientEmail });
  } catch (err: any) {
    await logDashboardAction({
      churchId: session.churchId,
      actorUserId: session.userId,
      actorEmail: session.email,
      actorRole: session.role,
      action: "statement.failed",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId, error: err.message },
      req,
    });
    return NextResponse.json({ error: err.message || "Failed to send statement" }, { status: 400 });
  }
}
