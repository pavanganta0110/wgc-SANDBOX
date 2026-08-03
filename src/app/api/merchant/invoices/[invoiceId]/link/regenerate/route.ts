import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { regenerateInvoicePublicToken } from "@/lib/invoices/invoicePublicToken";
import { canAcceptPayment, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

/** Revokes the current active link (if any) and mints a fresh one — the old
 * link stops working immediately. Use for a suspected leak or if the
 * merchant simply needs the raw token again (this codebase's established
 * pattern doesn't support re-displaying a previously-issued token). */
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
  if (auth.role === "fundraiser" && invoice.createdByUserId !== auth.userId) {
    return NextResponse.json({ error: "You do not have permission to manage this invoice's payment link." }, { status: 403 });
  }
  if (!canAcceptPayment(invoice.status as InvoiceStatus)) {
    return NextResponse.json({ error: "This invoice cannot have a payment link generated in its current state." }, { status: 409 });
  }

  const token = await regenerateInvoicePublicToken(invoiceId, auth.churchId);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.link_regenerated",
    entityType: "invoice",
    entityId: invoiceId,
    req,
  });

  return NextResponse.json({ success: true, token, url: `${process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com"}/invoice/${token}` });
}
