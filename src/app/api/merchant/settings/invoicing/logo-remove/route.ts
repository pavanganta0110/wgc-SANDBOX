import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";

/** Removes the invoice-specific logo — invoices then fall back to the
 * primary merchant logo, or a professional text header if neither is set.
 * Never falls back to another merchant's logo or a fake placeholder. */
export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageInvoiceSettings");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  await prisma.invoiceSettings.upsert({
    where: { churchId: auth.churchId },
    create: { churchId: auth.churchId, invoiceLogoUrl: null },
    update: { invoiceLogoUrl: null },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "invoice_settings.logo_removed",
    entityType: "invoice_settings",
    req,
  });

  return NextResponse.json({ success: true });
}
