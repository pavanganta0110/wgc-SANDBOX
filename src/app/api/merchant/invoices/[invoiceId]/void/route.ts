import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { canVoid, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

export async function POST(req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canVoidInvoices");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { invoiceId } = await params;
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, churchId: auth.churchId } });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  if (!canVoid(invoice.status as InvoiceStatus)) {
    return NextResponse.json({ error: "This invoice cannot be voided in its current state." }, { status: 409 });
  }

  // Voiding revokes any active public token — a voided invoice's payment
  // link must stop working immediately, per "Void invoices cannot accept
  // payment."
  await prisma.$transaction([
    prisma.invoice.update({ where: { id: invoiceId }, data: { status: "VOID", voidedAt: new Date(), voidedByUserId: auth.userId } }),
    prisma.invoicePublicToken.updateMany({ where: { invoiceId, status: "ACTIVE" }, data: { status: "REVOKED", revokedAt: new Date() } }),
  ]);

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice.voided",
    entityType: "invoice",
    entityId: invoiceId,
    req,
  });

  return NextResponse.json({ success: true });
}
