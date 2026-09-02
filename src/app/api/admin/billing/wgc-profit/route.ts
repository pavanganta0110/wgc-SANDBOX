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

  // A date-only "to" param (e.g. "2026-09-02" from a <input type="date">)
  // parses as midnight UTC that day — extended to the end of that day so a
  // payment that happened later the same day (the common case) isn't
  // silently excluded from a range whose end date is "today." Only
  // extended when the param is genuinely date-only (no time component
  // already present), so a future caller passing a full ISO timestamp
  // isn't silently overridden.
  const to = toParam ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(toParam) ? `${toParam}T23:59:59.999Z` : toParam) : new Date();
  const from = fromParam ? new Date(fromParam) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "Invalid from/to date." }, { status: 400 });
  }

  const summary = await getWgcProfitSummary({ from, to });
  return NextResponse.json({ summary });
}
