import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { ensureInvoicePublicToken, InvoicePublicTokenAlreadyExistsError } from "@/lib/invoices/invoicePublicToken";
import { canAcceptPayment, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

/**
 * Creates the invoice's public payment link if one doesn't already exist.
 * The raw token is only ever returned here, once, at creation — matching
 * this codebase's existing SubscriptionSetupLink precedent ("the raw token
 * exists solely in the emailed URL and this single response"). If a link
 * already exists, this returns `alreadyExists: true` with no token — the
 * merchant must explicitly regenerate (POST .../link/regenerate) to get a
 * new copyable link, which invalidates the old one.
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
  if (!canAcceptPayment(invoice.status as InvoiceStatus)) {
    return NextResponse.json({ error: "This invoice cannot have a payment link generated in its current state." }, { status: 409 });
  }

  try {
    const token = await ensureInvoicePublicToken(invoiceId, auth.churchId);
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "invoice.link_generated",
      entityType: "invoice",
      entityId: invoiceId,
      req,
    });
    return NextResponse.json({ success: true, token, url: `${process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com"}/invoice/${token}` });
  } catch (err) {
    if (err instanceof InvoicePublicTokenAlreadyExistsError) {
      return NextResponse.json({ success: true, alreadyExists: true });
    }
    throw err;
  }
}
