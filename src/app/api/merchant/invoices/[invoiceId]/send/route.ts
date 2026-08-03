import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { canSend, computeDerivedInvoiceStatus, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";
import { validateInvoiceForSend } from "@/lib/invoices/invoiceSendValidation";
import { ensureInvoicePublicToken, InvoicePublicTokenAlreadyExistsError, regenerateInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { sendInvoiceEmail } from "@/lib/invoices/invoiceEmails";

/**
 * The one action that actually moves an invoice from DRAFT/SCHEDULED to
 * SENT — runs the full pre-send checklist (validateInvoiceForSend), mints
 * (or reuses) the invoice's public payment link, and emails it to the
 * client. Per validateInvoiceForSend's own doc comment, the invoice only
 * flips to SENT once delivery actually succeeds — a failed email leaves it
 * DRAFT/SCHEDULED with a recorded InvoiceDelivery failure the merchant can
 * see and retry (by calling this route again).
 */
export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canSendInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const isResend = invoice.status !== "DRAFT" && invoice.status !== "SCHEDULED";
  if (!isResend && !canSend(invoice.status as InvoiceStatus)) {
    return NextResponse.json({ error: "This invoice cannot be sent in its current state." }, { status: 409 });
  }

  const validation = await validateInvoiceForSend(invoiceId, auth.churchId);
  if (!validation.valid) {
    return NextResponse.json({ error: "This invoice isn't ready to send.", fieldErrors: validation.errors }, { status: 400 });
  }

  let token: string;
  try {
    token = await ensureInvoicePublicToken(invoiceId, auth.churchId);
  } catch (err) {
    if (err instanceof InvoicePublicTokenAlreadyExistsError) {
      // A resend never needs a fresh link — the merchant would have to
      // explicitly regenerate for that. Since ensureInvoicePublicToken
      // doesn't return an already-active token's raw value (by design, see
      // its own doc comment), resending re-derives a usable token here via
      // an explicit rotation only when this is the very first send is not
      // the case — for a resend we instead mint a fresh one, since the
      // original raw token was already lost to this server the first time
      // it was returned.
      token = await regenerateInvoicePublicToken(invoiceId, auth.churchId);
    } else {
      throw err;
    }
  }

  const emailResult = await sendInvoiceEmail(invoiceId, token);
  if (!emailResult.success) {
    return NextResponse.json({ error: emailResult.error || "Could not deliver the invoice email. Please try again." }, { status: 502 });
  }

  const now = new Date();
  const derivedStatus = isResend
    ? computeDerivedInvoiceStatus({
        currentStatus: invoice.status as InvoiceStatus,
        balanceCents: invoice.balanceCents,
        totalCents: invoice.totalCents,
        hasBeenViewed: Boolean(invoice.firstViewedAt),
        dueDate: invoice.dueDate,
        now,
      })
    : "SENT";

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: { status: derivedStatus, sentAt: invoice.sentAt ?? now },
  });

  await prisma.invoiceActivity.create({
    data: {
      invoiceId,
      churchId: auth.churchId,
      activityType: isResend ? "invoice.resent" : "invoice.sent",
      actorUserId: auth.userId,
      actorEmail: auth.email,
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: isResend ? "invoice.resent" : "invoice.sent",
    entityType: "invoice",
    entityId: invoiceId,
    req,
  });

  return NextResponse.json({ success: true, status: derivedStatus });
}
