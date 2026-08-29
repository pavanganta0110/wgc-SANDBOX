import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { computePledgeFulfillment } from "@/lib/pledges/pledgeFulfillment";
import { logDashboardAction } from "@/lib/dashboardAudit";

/**
 * Lists this pledge's donor's own external donations that aren't already
 * linked to a (different) pledge — the candidate pool for the "Link
 * Donation" picker on the Pledges/campaign pages. Anonymous/unmatched
 * pledges (no donorId) have nothing to list here.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ pledgeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canRecordPledgeFulfillment");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { pledgeId } = await params;
  const pledge = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
  if (!pledge) return toSafeErrorResponse("Pledge not found", 404);
  if (!pledge.donorId) return NextResponse.json({ donations: [] });

  const donations = await prisma.externalDonation.findMany({
    where: {
      churchId: auth.churchId,
      donorId: pledge.donorId,
      status: { notIn: ["RETURNED", "VOIDED"] },
      OR: [{ pledgeId: null }, { pledgeId }],
    },
    select: { id: true, donationAmountCents: true, donationDate: true, paymentMethod: true, pledgeId: true },
    orderBy: { donationDate: "desc" },
    take: 100,
  });

  return NextResponse.json({ donations });
}

/**
 * Links an EXISTING ExternalDonation to this pledge as fulfillment evidence
 * (the ExternalDonation itself is created through the normal Record
 * External Donation flow — this route only performs the link + rollup).
 * Online (Payment-based) fulfillment happens automatically at webhook time
 * via the public campaign page's pledgeId token — never through this route.
 */
export async function POST(req: Request, { params }: { params: Promise<{ pledgeId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return toSafeErrorResponse(err.message, err.status);
    throw err;
  }
  try {
    requirePermission(auth, "canRecordPledgeFulfillment");
  } catch (err) {
    if (err instanceof ForbiddenError) return toSafeErrorResponse(err.message, 403);
    throw err;
  }

  const { pledgeId } = await params;
  const pledge = await prisma.pledge.findFirst({ where: { id: pledgeId, churchId: auth.churchId } });
  if (!pledge) return toSafeErrorResponse("Pledge not found", 404);
  if (pledge.status === "CANCELED") return toSafeErrorResponse("Cannot record fulfillment for a canceled pledge", 400);

  const body = await req.json().catch(() => ({}));
  const { externalDonationId } = body;
  if (!externalDonationId || typeof externalDonationId !== "string") {
    return toSafeErrorResponse("externalDonationId is required", 400);
  }

  const donation = await prisma.externalDonation.findFirst({ where: { id: externalDonationId, churchId: auth.churchId } });
  if (!donation) return toSafeErrorResponse("External donation not found", 404);
  if (donation.pledgeId && donation.pledgeId !== pledgeId) {
    return toSafeErrorResponse("This donation is already linked to a different pledge", 409);
  }

  await prisma.externalDonation.update({ where: { id: externalDonationId }, data: { pledgeId } });
  await computePledgeFulfillment(pledgeId);

  const updated = await prisma.pledge.findUnique({ where: { id: pledgeId } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "pledge.fulfillment_recorded",
    entityType: "pledge",
    entityId: pledgeId,
    metadata: { externalDonationId, donationAmountCents: donation.donationAmountCents },
    req,
  });

  return NextResponse.json({ pledge: updated });
}
