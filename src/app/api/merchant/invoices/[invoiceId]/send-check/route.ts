import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { validateInvoiceForSend } from "@/lib/invoices/invoiceSendValidation";

/** Read-only pre-send validation check — powers the "before-send preview"
 * screen's readiness state. The actual /send route re-runs this exact
 * check server-side before doing anything, so this endpoint can never be
 * used to bypass validation; it's purely informational for the UI. */
export async function GET(_req: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
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
  const result = await validateInvoiceForSend(invoiceId, auth.churchId);
  return NextResponse.json(result);
}
