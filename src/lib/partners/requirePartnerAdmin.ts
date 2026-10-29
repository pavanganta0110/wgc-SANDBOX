import { NextResponse } from "next/server";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import type { AdminSession } from "@/lib/auth/session";

/**
 * Creating a partner, inviting its staff and linking organizations hand out
 * access to other organizations' data, so it is limited to MFA-verified super
 * admins. Returns the session, or the response to send back.
 */
export async function requirePartnerAdmin(): Promise<{ session: AdminSession } | { response: NextResponse }> {
  try {
    const session = await requireMfaVerifiedAdminSession();
    if (session.role !== "wgc_super_admin") {
      return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
    }
    return { session };
  } catch (err) {
    if (isAuthError(err)) return { response: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
}
