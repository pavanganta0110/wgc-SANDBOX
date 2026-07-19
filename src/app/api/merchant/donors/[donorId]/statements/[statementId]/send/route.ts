import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { sendYearEndStatementEmail } from "@/lib/donors/generateStatement";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request, { params }: { params: Promise<{ donorId: string; statementId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { donorId, statementId } = await params;
  const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, donorId, churchId: auth.churchId } });
  if (!statement) {
    return NextResponse.json({ error: "Statement not found" }, { status: 404 });
  }

  const isResend = statement.sentAt != null;

  try {
    const result = await sendYearEndStatementEmail(statementId, auth.churchId, auth.email);

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: isResend ? "statement.resent" : "statement.emailed",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId, recipientEmail: result.recipientEmail },
      req,
    });

    return NextResponse.json({ success: true, recipientEmail: result.recipientEmail });
  } catch (err: any) {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "statement.failed",
      entityType: "donor",
      entityId: donorId,
      metadata: { statementId, error: err.message },
      req,
    });
    return NextResponse.json({ error: err.message || "Failed to send statement" }, { status: 400 });
  }
}
