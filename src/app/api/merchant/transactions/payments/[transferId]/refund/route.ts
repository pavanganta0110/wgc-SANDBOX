import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { redactFinixPayload } from "@/lib/finix/redact";
import { checkRefundEligibility } from "@/lib/payments/refundEligibility";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { requireFullOrganizationContext } from "@/lib/auth/viewScope";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    // Team-access Checkpoint 4 refund policy: OWNER can always refund;
    // ADMIN only with canIssueRefunds (override-only in the base matrix,
    // false by default); FUNDRAISER/VIEWER never, even for their own
    // attributed payments. A reporting viewScope must never independently
    // grant this — requirePermission resolves strictly from role +
    // permissionsJson, never from the view-scope cookie.
    requirePermission(auth, "canIssueRefunds");
    // Refunding is a financial mutation, not a reporting action — blocked
    // while viewing another user's scope, same as team/bank/billing changes.
    await requireFullOrganizationContext(auth);
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { transferId } = await params;

  const [transfer, refunds, bankReturns] = await Promise.all([
    prisma.finixTransfer.findFirst({
      where: { finixTransferId: transferId, churchId: auth.churchId },
    }),
    prisma.finixRefundOrReversal.findMany({
      where: { finixOriginalTransferId: transferId, churchId: auth.churchId },
    }),
    prisma.bankReturn.findMany({
      where: { originalTransferId: transferId, churchId: auth.churchId },
    }),
  ]);

  if (!transfer) {
    return toSafeErrorResponse("This record could not be found.", 404);
  }

  const eligibility = checkRefundEligibility(transfer, refunds, bankReturns, auth.churchId);
  if (!eligibility.eligible) {
    return toSafeErrorResponse(eligibility.reason || "This transaction is not eligible for a refund.", 400);
  }

  const body = await req.json().catch(() => ({}));
  const amountCents = typeof body.amountCents === "number" ? Math.round(body.amountCents) : undefined;

  if (amountCents != null && (amountCents <= 0 || amountCents > (transfer.amountCents ?? 0))) {
    return toSafeErrorResponse("The refund amount cannot exceed the remaining refundable balance.", 400);
  }

  try {
    const reversal = await finixClient.createTransferReversal(transferId, {
      ...(amountCents != null ? { refund_amount: amountCents } : {}),
      tags: { source: "wgc_merchant_dashboard", merchantId: transfer.finixMerchantId ?? "", churchId: auth.churchId },
    });

    // Persist immediately so the UI reflects it right away. Deliberately
    // never touches Payment.attributedUserId — a refund is a distinct
    // event on FinixRefundOrReversal, not a rewrite of the original
    // payment's attribution (see attributionSnapshot.ts's module comment).
    await prisma.finixRefundOrReversal.upsert({
      where: { finixReversalId: reversal.id },
      create: {
        finixReversalId: reversal.id,
        churchId: auth.churchId,
        finixOriginalTransferId: transferId,
        finixMerchantId: transfer.finixMerchantId,
        amountCents: reversal.amount ?? amountCents ?? transfer.amountCents,
        currency: reversal.currency ?? transfer.currency,
        state: reversal.state ?? "PENDING",
        type: reversal.type ?? "REVERSAL",
        subtype: reversal.subtype ?? null,
        source: "wgc_merchant_dashboard",
        rawJsonRedacted: redactFinixPayload(reversal),
        createdAtFinix: reversal.created_at ? new Date(reversal.created_at) : new Date(),
        lastSyncedAt: new Date(),
      },
      update: {
        state: reversal.state ?? undefined,
        rawJsonRedacted: redactFinixPayload(reversal),
        lastSyncedAt: new Date(),
      },
    });

    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "payment.refund_issued",
      entityType: "Payment",
      entityId: transferId,
      // Safe metadata only — amount and status, never card/bank details.
      metadata: {
        reversalId: reversal.id,
        amountCents: reversal.amount ?? amountCents ?? transfer.amountCents,
        state: reversal.state ?? "PENDING",
        isPartial: amountCents != null && amountCents < (transfer.amountCents ?? 0),
      },
      req,
    });

    return NextResponse.json({ success: true, reversalId: reversal.id, state: reversal.state });
  } catch (error: any) {
    console.error(`Refund failed for transfer ${transferId}:`, error);
    return toSafeErrorResponse(error, 400, {
      userId: auth.userId,
      organizationId: auth.churchId,
      route: `/api/merchant/transactions/payments/${transferId}/refund`,
      action: "CREATE_REFUND",
      resourceId: transferId,
    });
  }
}
