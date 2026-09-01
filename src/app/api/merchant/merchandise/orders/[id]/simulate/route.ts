import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { getPrintfulMode } from "@/lib/integrations/printful/config";
import { simulateMockWebhookEvent } from "@/lib/integrations/printful/webhooks";

const ALLOWED = new Set(["IN_FULFILLMENT", "SHIPPED", "DELIVERED", "FAILED", "CANCELLED"]);

/**
 * Sandbox-only mock webhook tester (spec item 46) — never available when
 * PRINTFUL_MODE is "live". Not linked from any public/donor-facing surface;
 * reachable only from the merchant order-detail page in mock mode, behind
 * the same canManageMerchandise permission as a real retry/cancel action.
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

  if (getPrintfulMode() !== "mock") {
    return NextResponse.json({ error: "The mock webhook simulator is only available in PRINTFUL_MODE=mock." }, { status: 400 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!ALLOWED.has(body?.nextStatus)) {
    return NextResponse.json({ error: `nextStatus must be one of: ${Array.from(ALLOWED).join(", ")}` }, { status: 400 });
  }

  try {
    await simulateMockWebhookEvent({ orderId: id, churchId: auth.churchId, nextStatus: body.nextStatus });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Could not simulate this event." }, { status: 400 });
  }
}
