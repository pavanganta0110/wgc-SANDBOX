import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveViewScope } from "@/lib/auth/viewScope";
import { resolveScopedUserId } from "@/lib/auth/scopes";

/**
 * Mirrors buildPaymentScope/resolveScopedDonorIds' rule for ExternalDonation:
 * a user without canViewAllTransactions (FUNDRAISER and VIEWER by default)
 * only sees donations they personally recorded (createdByUserId), never the
 * whole organization's. Before this existed, every External Donations page
 * and API route did a flat `where: { churchId }` with no user-level scoping
 * at all — a FUNDRAISER or VIEWER teammate could see every other teammate's
 * recorded cash/check/Cash App donations org-wide, which is inconsistent
 * with how Payments/Donors are scoped everywhere else in this app.
 */
export async function resolveExternalDonationScopedUserId(auth: MerchantAuthContext): Promise<string | null> {
  const viewScope = await resolveViewScope(auth);
  return resolveScopedUserId(auth, viewScope);
}

/**
 * Loads one ExternalDonation, returning null both when it doesn't exist and
 * when it exists but is out of the caller's scope — callers must respond
 * identically (404) in both cases so scope can never be probed by ID.
 */
export async function loadScopedExternalDonation(id: string, auth: MerchantAuthContext) {
  const scopedUserId = await resolveExternalDonationScopedUserId(auth);
  const donation = await prisma.externalDonation.findFirst({
    where: { id, churchId: auth.churchId, ...(scopedUserId ? { createdByUserId: scopedUserId } : {}) },
  });
  return donation;
}
