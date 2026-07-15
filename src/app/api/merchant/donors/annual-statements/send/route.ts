import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { sendYearEndStatementEmail } from "@/lib/donors/generateStatement";

// Explicit admin confirmation required to reach this route at all — never
// triggered automatically. Idempotent per statement: a statement already
// SENT can be resent (tracked via resendCount) but this route never
// double-sends within the same request for the same statement ID.
export async function POST(req: Request) {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const statementIds: string[] = [...new Set<string>(Array.isArray(body.statementIds) ? body.statementIds : [])];
  if (statementIds.length === 0) {
    return NextResponse.json({ error: "statementIds is required" }, { status: 400 });
  }

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "statement.bulk_sending_started",
    entityType: "donor",
    metadata: { count: statementIds.length },
    req,
  });

  let sent = 0;
  let failed = 0;
  let skippedNeedsReview = 0;

  for (const statementId of statementIds) {
    const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, churchId: session.churchId } });
    if (!statement) {
      failed += 1;
      continue;
    }
    if (statement.statementStatus === "NEEDS_REVIEW") {
      skippedNeedsReview += 1;
      continue;
    }
    try {
      await sendYearEndStatementEmail(statementId, session.churchId, session.email);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "statement.bulk_sending_completed",
    entityType: "donor",
    metadata: { sent, failed, skippedNeedsReview },
    req,
  });

  return NextResponse.json({ sent, failed, skippedNeedsReview });
}
