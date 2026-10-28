import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession, type MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { hasPermission } from "@/lib/auth/permissions";

/** Read-only access to the roster, ledger and exports. */
export function canViewStudents(auth: MerchantAuthContext): boolean {
  return hasPermission(auth, "canViewDonors");
}

/** Importing the roster, editing students, assigning gifts, enabling the feature. */
export function canManageStudents(auth: MerchantAuthContext): boolean {
  return hasPermission(auth, "canManageOrgSettings");
}

export type StudentApiGuard =
  | { ok: true; auth: MerchantAuthContext; enabled: boolean }
  | { ok: false; response: NextResponse };

/**
 * Shared gate for every /api/merchant/students/* route: resolves the tenant
 * from the session only (never from the request), checks the permission, and
 * — unless `allowDisabled` — refuses when Student Giving isn't turned on.
 */
export async function guardStudentApi(opts: { manage: boolean; allowDisabled?: boolean }): Promise<StudentApiGuard> {
  let auth: MerchantAuthContext;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return { ok: false, response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  const allowed = opts.manage ? canManageStudents(auth) : canViewStudents(auth);
  if (!allowed) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { studentGivingEnabled: true } });
  const enabled = !!church?.studentGivingEnabled;
  if (!enabled && !opts.allowDisabled) {
    return { ok: false, response: NextResponse.json({ error: "Student Giving is not enabled for this organization" }, { status: 403 }) };
  }
  return { ok: true, auth, enabled };
}
