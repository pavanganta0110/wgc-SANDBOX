import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { chargePromoShortfall, PromoShortfallChargeError } from "@/lib/billing/promoShortfallCharge";

/**
 * The only place in the codebase that actually moves money for a promo
 * minimum-processing shortfall — requires an authenticated, MFA-verified
 * WGC billing admin with canManageBilling AND explicit confirmation in the
 * request body. There is no automatic/cron path that reaches this.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canManageBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body.confirmed !== true) {
    return NextResponse.json({ error: "Confirmation is required to charge a real payment method." }, { status: 400 });
  }

  const { id } = await params;

  try {
    const result = await chargePromoShortfall(id, { userId: session.userId, email: session.email, role: session.role });
    return NextResponse.json({ success: true, shortfall: result });
  } catch (err) {
    if (err instanceof PromoShortfallChargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Promo shortfall charge failed:", err);
    return NextResponse.json({ error: "Something went wrong processing this charge." }, { status: 500 });
  }
}
