import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function GET(_req: Request, { params }: { params: Promise<{ pledgeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canViewPledges");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { pledgeId } = await params;
  const pledge = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
  if (!pledge) return toSafeErrorResponse("Pledge not found", 404);

  const [externalDonations, payments] = await Promise.all([
    prisma.externalDonation.findMany({ where: { pledgeId, churchId: auth.churchId }, orderBy: { donationDate: "desc" } }),
    prisma.payment.findMany({ where: { pledgeId, churchId: auth.churchId }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({ pledge, fulfillments: { externalDonations, payments } });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ pledgeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canEditPledge");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { pledgeId } = await params;
  const existing = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
  if (!existing) return toSafeErrorResponse("Pledge not found", 404);

  const body = await req.json().catch(() => ({}));
  const { pledgeAmountCents, dueDate, notes } = body;
  if (pledgeAmountCents != null && (!Number.isFinite(pledgeAmountCents) || pledgeAmountCents <= 0)) {
    return toSafeErrorResponse("Pledge amount must be a valid positive amount", 400);
  }

  const pledge = await prisma.pledge.update({
    where: { id: pledgeId },
    data: {
      ...(pledgeAmountCents !== undefined ? { pledgeAmountCents } : {}),
      ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge.updated",
    entityType: "pledge",
    entityId: pledge.id,
    metadata: { fields: Object.keys(body) },
    req,
  });

  return NextResponse.json({ pledge });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ pledgeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canCancelPledge");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { pledgeId } = await params;
  const existing = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
  if (!existing) return toSafeErrorResponse("Pledge not found", 404);

  const body = await req.json().catch(() => ({}));
  const pledge = await prisma.pledge.update({
    where: { id: pledgeId },
    data: { status: "CANCELED", canceledAt: new Date(), cancelReason: body.reason?.trim() || null },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge.canceled",
    entityType: "pledge",
    entityId: pledge.id,
    metadata: { reason: pledge.cancelReason },
    req,
  });

  return NextResponse.json({ pledge });
}
