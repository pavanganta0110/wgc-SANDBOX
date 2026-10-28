import { NextResponse } from "next/server";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";

/** WGC staff switch for the per-organization Student Giving feature. */
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

  const body = await req.json().catch(() => ({}));
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be true or false" }, { status: 400 });

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { id: true } });
  if (!church) return NextResponse.json({ error: "Organization not found" }, { status: 404 });

  const updated = await prisma.church.update({
    where: { id: churchId },
    data: { studentGivingEnabled: body.enabled },
    select: { studentGivingEnabled: true },
  });
  return NextResponse.json({ studentGivingEnabled: updated.studentGivingEnabled });
}
