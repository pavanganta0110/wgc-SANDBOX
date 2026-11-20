import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth/permissions";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";

/**
 * The Fund catalog (Gift Designations) is a church-wide resource shared
 * across every giving link, not owned by one fundraiser — managing it
 * (create/edit/archive/reorder) is gated the same as other organization-
 * wide settings, not per-giving-link ownership. Assigning funds to a
 * specific giving link is part of editing that link itself, gated by
 * whatever permission already governs editing that link — no separate
 * check needed there.
 */
export function canManageFunds(auth: MerchantAuthContext): boolean {
  return hasPermission(auth, "canManageOrgSettings");
}

/**
 * Read-only access to the fund catalog for populating a fund picker —
 * deliberately broader than canManageFunds. Fund names/ids are not
 * sensitive (they're already shown on public, unauthenticated giving
 * pages); a fundraiser recording or importing external donations needs to
 * select a fund without being able to create/archive/reorder the catalog.
 */
export function canReadFundCatalog(auth: MerchantAuthContext): boolean {
  return (
    canManageFunds(auth) ||
    hasPermission(auth, "canCreateExternalDonation") ||
    hasPermission(auth, "canEditExternalDonation") ||
    hasPermission(auth, "canImportExternalDonations")
  );
}

/**
 * Funds this user may assign or record gifts against. null = unrestricted
 * (owners and admins). A FUNDRAISER only gets the funds already on giving links
 * they own, so they can never attach or record against another person's fund.
 */
export async function allowedFundIdsFor(auth: MerchantAuthContext): Promise<Set<string> | null> {
  if (auth.role !== "fundraiser") return null;
  const links = await prisma.givingLink.findMany({ where: { churchId: auth.churchId, ownerUserId: auth.userId }, select: { id: true } });
  if (links.length === 0) return new Set();
  const rows = await prisma.givingLinkFund.findMany({ where: { givingLinkId: { in: links.map((l) => l.id) } }, select: { fundId: true } });
  return new Set(rows.map((r) => r.fundId));
}
