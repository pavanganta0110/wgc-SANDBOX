import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { canManageFunds } from "@/lib/giving/fundPermissions";

/**
 * Edit a fund's name/description, reorder it (displayOrder), or archive/
 * reactivate it (isActive). There is no DELETE — per spec, a fund that
 * already has transactions referencing it must never be permanently
 * removed, only archived, so historical reporting (which reads the
 * Payment.fundName snapshot, not a live join) stays correct either way.
 * Archiving is just isActive: false; it also removes the fund from any
 * future donor-facing dropdown without touching past GivingLinkFund
 * assignments or Payment/FinixSubscription snapshots.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ fundId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!canManageFunds(auth)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { fundId } = await params;
  const fund = await prisma.fund.findFirst({ where: { id: fundId, churchId: auth.churchId } });
  if (!fund) {
    return NextResponse.json({ error: "Fund not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const data: { name?: string; description?: string | null; isActive?: boolean; displayOrder?: number } = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ error: "Fund name cannot be empty" }, { status: 400 });
    const conflict = await prisma.fund.findUnique({ where: { churchId_name: { churchId: auth.churchId, name } } });
    if (conflict && conflict.id !== fundId) {
      return NextResponse.json({ error: "A fund with this name already exists" }, { status: 409 });
    }
    data.name = name;
  }
  if (body.description !== undefined) {
    data.description = typeof body.description === "string" ? body.description.trim() || null : null;
  }
  if (body.isActive !== undefined) {
    data.isActive = !!body.isActive;
  }
  if (body.displayOrder !== undefined && Number.isInteger(body.displayOrder)) {
    data.displayOrder = body.displayOrder;
  }

  const updated = await prisma.fund.update({ where: { id: fundId }, data });
  return NextResponse.json({ fund: updated });
}
