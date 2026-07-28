import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { resolveOrCreateDonor } from "@/lib/donors/resolveOrCreateDonor";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";
import { resolveExternalDonationScopedUserId } from "@/lib/donations/externalDonationScope";

/**
 * Connects an Unmatched (or previously matched) external donation to a
 * donor — used both from the initial recording flow and later from the
 * "Unmatched External Donations" section. Every reassignment is logged,
 * per spec ("Keep an audit log whenever the donor assignment changes").
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canMatchExternalDonationToDonor");
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { mode, donorId, donorName, donorEmail, donorPhone } = body ?? {};
  const fromStatus = existing.donorMatchStatus;

  let update: { donorId: string | null; donorMatchStatus: "MATCHED" | "ANONYMOUS" | "UNMATCHED"; isAnonymous: boolean };

  if (mode === "existing") {
    if (!donorId) return NextResponse.json({ error: "donorId is required" }, { status: 400 });
    const donor = await prisma.donor.findFirst({ where: { id: donorId, churchId: auth.churchId } });
    if (!donor) return NextResponse.json({ error: "Donor not found" }, { status: 400 });
    update = { donorId: donor.id, donorMatchStatus: "MATCHED", isAnonymous: false };
  } else if (mode === "new") {
    if (donorEmail && !isValidEmail(donorEmail)) {
      return NextResponse.json({ error: "Please enter a valid donor email address" }, { status: 400 });
    }
    let normalizedPhone: string | null = null;
    if (donorPhone) {
      normalizedPhone = normalizeUSPhone(donorPhone);
      if (!normalizedPhone) return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
    }
    if (!donorName?.trim() && !donorEmail && !normalizedPhone) {
      return NextResponse.json({ error: "Provide at least a donor name, email, or phone" }, { status: 400 });
    }
    const resolved = await resolveOrCreateDonor({ churchId: auth.churchId, name: donorName, email: donorEmail, phone: donorPhone });
    update = { donorId: resolved.id, donorMatchStatus: "MATCHED", isAnonymous: false };
  } else if (mode === "anonymous") {
    update = { donorId: null, donorMatchStatus: "ANONYMOUS", isAnonymous: true };
  } else if (mode === "unmatch") {
    update = { donorId: null, donorMatchStatus: "UNMATCHED", isAnonymous: false };
  } else {
    return NextResponse.json({ error: "mode must be one of: existing, new, anonymous, unmatch" }, { status: 400 });
  }

  const updated = await prisma.externalDonation.update({ where: { id }, data: update });

  await prisma.externalDonationAuditLog.create({
    data: {
      externalDonationId: id,
      action: "DONOR_ASSIGNMENT_CHANGED",
      fromValue: fromStatus,
      toValue: update.donorMatchStatus,
      performedByUserId: auth.userId,
    },
  });
  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.role,
    action: "external_donation.donor_matched",
    entityType: "ExternalDonation",
    entityId: id,
    metadata: { from: fromStatus, to: update.donorMatchStatus },
    req,
  });

  return NextResponse.json({ donation: updated });
}
