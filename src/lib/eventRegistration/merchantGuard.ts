import { NextResponse } from "next/server";
import { requireMerchantSession, type MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import type { PermissionKey } from "@/lib/auth/roles";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { toSafeErrorResponse } from "@/lib/utils/errorNormalizer";
import { prisma } from "@/lib/prisma";

/**
 * Session + permission gate shared by every /api/merchant/events route.
 * Returns the auth context (whose churchId is the ONLY tenant id any query
 * here may use) or a ready-to-return error response.
 */
export async function guardEventsRoute(permission: PermissionKey): Promise<{ auth: MerchantAuthContext } | { response: NextResponse }> {
  let auth: MerchantAuthContext;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return { response: toSafeErrorResponse(err.message, err.status) };
    throw err;
  }
  try {
    requirePermission(auth, permission);
  } catch (err) {
    if (err instanceof ForbiddenError) return { response: toSafeErrorResponse(err.message, 403) };
    throw err;
  }
  return { auth };
}

/** Loads an event only if it belongs to this church — a foreign or unknown id is indistinguishable (404). */
export async function loadOwnedEvent(churchId: string, eventId: string) {
  return prisma.event.findFirst({ where: { id: eventId, churchId } });
}

export function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Event not found." }, { status: 404 });
}
