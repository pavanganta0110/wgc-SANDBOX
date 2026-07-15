import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { validateGoodsServicesInput, computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";
import { sendDonationReceipt } from "@/lib/giving/generateReceipt";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Post-payment correction of a payment's goods/services acknowledgment
 * info. Before a receipt has ever been sent, this simply updates the
 * payment. Once a receipt has been sent (Payment.receiptSentAt is set),
 * the caller must explicitly pass resend: true — an unconfirmed correction
 * is saved but the donor is never re-emailed silently, and a confirmed
 * resend creates a new DonationReceipt version rather than mutating what
 * was already sent (see sendDonationReceipt).
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ transferId: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { transferId } = await params;
  const payment = await prisma.payment.findFirst({ where: { finixTransferId: transferId, churchId: session.churchId } });
  if (!payment) {
    return NextResponse.json({ error: "Payment not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const goodsServicesProvided = Boolean(body.goodsServicesProvided);
  const goodsServicesDescription = typeof body.goodsServicesDescription === "string" ? body.goodsServicesDescription : "";
  const goodsServicesFairMarketValueCents = typeof body.goodsServicesFairMarketValueCents === "number" ? body.goodsServicesFairMarketValueCents : null;
  const goodsServicesInternalNote = typeof body.goodsServicesInternalNote === "string" ? body.goodsServicesInternalNote.trim() || null : payment.goodsServicesInternalNote;
  const resend = Boolean(body.resend);

  const paymentAmountCents = payment.donationAmountCents ?? payment.amountCents;
  const validation = validateGoodsServicesInput({ provided: goodsServicesProvided, description: goodsServicesDescription, fairMarketValueCents: goodsServicesFairMarketValueCents }, paymentAmountCents);
  if (!validation.valid) {
    return NextResponse.json({ error: "Please correct the goods/services information", fieldErrors: validation.errors }, { status: 400 });
  }

  const previousValues = {
    goodsServicesProvided: payment.goodsServicesProvided,
    goodsServicesDescription: payment.goodsServicesDescription,
    goodsServicesFairMarketValueCents: payment.goodsServicesFairMarketValueCents,
    recordedContributionAmountCents: payment.recordedContributionAmountCents,
  };

  const recordedContributionAmountCents = goodsServicesProvided
    ? computeRecordedContributionAmountCents(paymentAmountCents, goodsServicesFairMarketValueCents ?? 0)
    : paymentAmountCents;

  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: {
      goodsServicesProvided,
      goodsServicesDescription: goodsServicesProvided ? goodsServicesDescription.trim() : null,
      goodsServicesFairMarketValueCents: goodsServicesProvided ? goodsServicesFairMarketValueCents : null,
      goodsServicesInternalNote,
      recordedContributionAmountCents,
      acknowledgmentConfiguredByUserId: session.userId,
      acknowledgmentConfiguredAt: new Date(),
    },
  });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "giving.goods_services_acknowledgment_corrected",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      previousValues,
      newValues: {
        goodsServicesProvided,
        goodsServicesDescription: updated.goodsServicesDescription,
        goodsServicesFairMarketValueCents: updated.goodsServicesFairMarketValueCents,
        recordedContributionAmountCents,
      },
      receiptAlreadySent: Boolean(payment.receiptSentAt),
      resendRequested: resend,
    },
    req,
  });

  let receiptResult: { receiptNumber: string; version: number } | null = null;
  if (payment.receiptSentAt && resend) {
    receiptResult = await sendDonationReceipt(payment.id, session.churchId, session.userId);
  }

  return NextResponse.json({ success: true, requiresResendConfirmation: Boolean(payment.receiptSentAt) && !resend, receipt: receiptResult });
}
