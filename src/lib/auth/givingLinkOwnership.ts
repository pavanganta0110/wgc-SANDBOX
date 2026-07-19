import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "./requireMerchantSession";
import { hasPermission, requirePermission } from "./permissions";
import { ForbiddenError } from "./errors";

async function assertActiveUserInChurch(userId: string, churchId: string, context: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, churchId: true, disabledAt: true },
  });
  if (!user || user.churchId !== churchId) {
    throw new ForbiddenError(`${context}: target user does not belong to your organization.`);
  }
  if (user.disabledAt) {
    throw new ForbiddenError(`${context}: cannot assign a giving link to a disabled user.`);
  }
}

/**
 * Resolves GivingLink.ownerUserId for a new link, per the Checkpoint 3
 * creation rules. Never trusts a client-supplied ownerUserId without
 * same-church + role validation — a FUNDRAISER's request is forced to
 * themselves regardless of what the request body says.
 */
export async function resolveGivingLinkOwnerForCreate(
  auth: MerchantAuthContext,
  requestedOwnerUserId: string | null | undefined
): Promise<string> {
  // VIEWER (and any unrecognized role) has canCreateGivingLinks: false —
  // this throws before any of the role-specific logic below runs.
  requirePermission(auth, "canCreateGivingLinks");

  if (auth.role === "fundraiser") {
    if (requestedOwnerUserId && requestedOwnerUserId !== auth.userId) {
      throw new ForbiddenError("Fundraisers can only create giving links owned by themselves.");
    }
    return auth.userId;
  }

  // No owner selected, or selecting yourself — always allowed for OWNER/ADMIN.
  if (!requestedOwnerUserId || requestedOwnerUserId === auth.userId) {
    return auth.userId;
  }

  // Assigning to someone else at creation time.
  if (auth.role === "admin" && !hasPermission(auth, "canEditAllGivingLinks")) {
    throw new ForbiddenError("You don't have permission to assign a giving link to another user.");
  }
  // OWNER always has canEditAllGivingLinks in the base matrix, so no
  // additional check needed for auth.role === "owner" here.

  await assertActiveUserInChurch(requestedOwnerUserId, auth.churchId, "Cannot create giving link");
  return requestedOwnerUserId;
}

export interface GivingLinkReassignmentCheck {
  currentOwnerUserId: string | null;
  linkChurchId: string;
}

/**
 * Validates a giving-link reassignment (an edit that changes ownerUserId on
 * an existing link). Throws ForbiddenError if not allowed. Does not perform
 * the write or the audit log entry — callers do that themselves so the
 * write, audit log, and any other simultaneous field edits stay in one
 * transaction/response.
 */
export async function validateGivingLinkReassignment(
  auth: MerchantAuthContext,
  link: GivingLinkReassignmentCheck,
  newOwnerUserId: string
): Promise<void> {
  if (link.linkChurchId !== auth.churchId) {
    throw new ForbiddenError("This giving link does not belong to your organization.");
  }

  const isNoOp = link.currentOwnerUserId === newOwnerUserId;
  if (isNoOp) return;

  if (auth.role === "owner") {
    // allowed
  } else if (auth.role === "admin" && hasPermission(auth, "canEditAllGivingLinks")) {
    // allowed
  } else {
    throw new ForbiddenError("You don't have permission to reassign this giving link.");
  }

  await assertActiveUserInChurch(newOwnerUserId, auth.churchId, "Cannot reassign giving link");
}
