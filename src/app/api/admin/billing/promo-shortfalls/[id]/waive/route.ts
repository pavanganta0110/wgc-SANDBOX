import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { waivePromoShortfall, PromoShortfallChargeError } from "@/lib/billing/promoShortfallCharge";

// Waiving forgives money owed to WGC — same MFA-verified-session
// requirement as actually charging it (see the sibling charge/route.ts).
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
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to waive a shortfall." }, { status: 400 });
  }

  const { id } = await params;

  try {
    const result = await waivePromoShortfall(id, { userId: session.userId, email: session.email, role: session.role }, reason);
    return NextResponse.json({ success: true, shortfall: result });
  } catch (err) {
    if (err instanceof PromoShortfallChargeError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    console.error("Promo shortfall waive failed:", err);
    return NextResponse.json({ error: "Something went wrong." }, { status: 500 });
  }
}
