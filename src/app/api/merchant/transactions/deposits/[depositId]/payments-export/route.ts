import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getSettlementPermissions } from "@/lib/finix/settlementPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { csvResponse } from "@/lib/csvExport";
import { loadDepositPaymentRows } from "@/lib/finix/depositPaymentRows";
import { buildDepositPaymentsCsv } from "@/lib/finix/depositPaymentsCsv";

/**
 * CSV of every payment inside one deposit (payer, student, note, amounts), so
 * finance can match the bank deposit and post entries line by line. Same
 * permission tier as the deposits list/export: settlement-level financial data.
 */
export async function GET(req: Request, { params }: { params: Promise<{ depositId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSettlementPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { depositId } = await params;
  const deposit = await prisma.finixFundingTransferAttempt.findFirst({
    where: { finixFundingTransferAttemptId: depositId, churchId: auth.churchId },
  });
  if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });

  const church = await prisma.church.findUnique({
    where: { id: auth.churchId },
    select: { studentGivingEnabled: true, termFieldEnabled: true, paymentMode: true },
  });

  // Same single-settlement link the deposit detail page uses today.
  const settlementIds = deposit.finixSettlementId ? [deposit.finixSettlementId] : [];
  const rows = await loadDepositPaymentRows(auth.churchId, settlementIds);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "deposit.payments_export_performed",
    entityType: "deposit",
    entityId: depositId,
    metadata: { rowCount: rows.length },
    req,
  });

  const csv = buildDepositPaymentsCsv(rows, {
    depositId,
    depositNetCents: deposit.netAmountCents ?? deposit.amountCents ?? 0,
    showStudent: Boolean(church?.studentGivingEnabled),
    showTerm: Boolean(church?.studentGivingEnabled || church?.termFieldEnabled),
    paymentMode: Boolean(church?.paymentMode),
  });
  return csvResponse(csv, `deposit-${depositId}-payments.csv`);
}
