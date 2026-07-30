import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canVoidExternalDonation");
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }

  const { id } = await params;
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);
  const existing = await prisma.externalDonation.findFirst({
    where: { id, churchId: auth.churchId, ...(scopedUserId ? { createdByUserId: scopedUserId } : {}) },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.status === "VOIDED") {
    return NextResponse.json({ error: "This donation is already voided" }, { status: 400 });
  }

  let reason: string | undefined;
  try {
    const body = await req.json();
    reason = typeof body?.reason === "string" ? body.reason : undefined;
  } catch {
    // Body is optional for void.
  }

  const updated = await prisma.externalDonation.update({
    where: { id },
    data: { status: "VOIDED", voidedAt: new Date(), voidedByUserId: auth.userId, voidReason: reason || null },
  });

  await prisma.externalDonationAuditLog.create({
    data: { externalDonationId: id, action: "VOIDED", toValue: reason || null, performedByUserId: auth.userId },
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation.voided",
    entityType: "ExternalDonation",
    entityId: id,
    metadata: { reason },
    req,
  });

  return NextResponse.json({ donation: updated });
}
