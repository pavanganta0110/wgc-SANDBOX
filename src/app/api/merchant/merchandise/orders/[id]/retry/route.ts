import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { retryOrderSubmission } from "@/lib/integrations/printful/orderService";

/**
 * Safe retry for the PAYMENT_SUCCESS/FULFILLMENT_PENDING case (spec item
 * 36) — the donor was already charged once by the time this order exists;
 * this only re-attempts the provider-side fulfillment submission and is
 * itself idempotent (submitOrderToProvider no-ops if already submitted).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  try {
    requirePermission(auth, "canManageMerchandise");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  try {
    const order = await retryOrderSubmission({ orderId: id, churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role, req });
    return NextResponse.json({ success: true, order: { status: order.status, fulfillmentStatus: order.fulfillmentStatus, externalOrderId: order.externalOrderId } });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: "Retry failed — this order will remain retryable." }, { status: 502 });
  }
}
