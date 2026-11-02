import { NextResponse } from "next/server";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { PAYMENT_MODE_SETTINGS_SELECT, parsePaymentModeUpdate } from "@/lib/settings/paymentMode";

/**
 * WGC staff switches for the per-organization "payment processor" mode
 * (payer wording, note on receipt, term field, branded dashboard). Same
 * permission gate as the Student Giving switch.
 */
export async function POST(req: Request, { params }: { params: Promise<{ churchId: string }> }) {
  const { churchId } = await params;
  let session;
  try {
    session = await requireMfaVerifiedAdminSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const admin = await prisma.user.findUnique({ where: { id: session.userId }, select: { permissionsJson: true } });
  const permissions = admin?.permissionsJson as Record<string, boolean> | null;
  const allowed = session.role === "wgc_super_admin" || (session.role === "wgc_admin" && permissions?.canManageUsers === true);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = parsePaymentModeUpdate(await req.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const updated = await prisma.church.update({
    where: { id: churchId },
    data: parsed.data,
    select: PAYMENT_MODE_SETTINGS_SELECT,
  });
  return NextResponse.json(updated);
}
