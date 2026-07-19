import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { sendYearEndStatementEmail } from "@/lib/donors/generateStatement";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

// Explicit admin confirmation required to reach this route at all — never
// triggered automatically. Idempotent per statement: a statement already
// SENT can be resent (tracked via resendCount) but this route never
// double-sends within the same request for the same statement ID.
export async function POST(req: Request) {
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

  const body = await req.json();
  const statementIds: string[] = [...new Set<string>(Array.isArray(body.statementIds) ? body.statementIds : [])];
  if (statementIds.length === 0) {
    return NextResponse.json({ error: "statementIds is required" }, { status: 400 });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "statement.bulk_sending_started",
    entityType: "donor",
    metadata: { count: statementIds.length },
    req,
  });

  let sent = 0;
  let failed = 0;
  let skippedNeedsReview = 0;

  for (const statementId of statementIds) {
    const statement = await prisma.annualDonationStatement.findFirst({ where: { id: statementId, churchId: auth.churchId } });
    if (!statement) {
      failed += 1;
      continue;
    }
    if (statement.statementStatus === "NEEDS_REVIEW") {
      skippedNeedsReview += 1;
      continue;
    }
    try {
      await sendYearEndStatementEmail(statementId, auth.churchId, auth.email);
      sent += 1;
    } catch {
      failed += 1;
    }
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "statement.bulk_sending_completed",
    entityType: "donor",
    metadata: { sent, failed, skippedNeedsReview },
    req,
  });

  return NextResponse.json({ sent, failed, skippedNeedsReview });
}
