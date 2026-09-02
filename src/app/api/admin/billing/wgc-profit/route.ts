import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import { resolveWgcAdminBillingPermissions } from "@/lib/auth/billingAdminPermissions";
import { getWgcProfitSummary } from "@/lib/reports/wgcProfit";

/**
 * Admin -> Billing & Subscriptions -> WGC Profit. Read-only, gated behind
 * canViewBilling (same as ./promotions GET) — never exposed to any
 * merchant-facing route. See src/lib/reports/wgcProfit.ts for why this is
 * computed fresh from FinixFee rather than reusing Payment.actualFinixFeesCents.
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const perms = resolveWgcAdminBillingPermissions(session.role, user?.permissionsJson);
  if (!perms.canViewBilling) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const to = toParam ? new Date(toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid from/to date." }, { status: 400 });
  }

  const summary = await getWgcProfitSummary({ from, to });
  return NextResponse.json({ summary });
}
