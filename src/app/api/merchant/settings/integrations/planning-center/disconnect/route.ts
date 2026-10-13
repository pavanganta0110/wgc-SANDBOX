import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError, ForbiddenError } from "@/lib/auth/errors";
import { requirePermission } from "@/lib/auth/permissions";
import { disconnectPlanningCenter } from "@/lib/integrations/planningcenter/service";
import { PlanningCenterConnectionError } from "@/lib/integrations/planningcenter/errors";

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  try {
    requirePermission(auth, "canManageIntegrations");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  try {
    const connection = await disconnectPlanningCenter({ churchId: auth.churchId, actorUserId: auth.userId, actorEmail: auth.email, actorRole: auth.role, req });
    return NextResponse.json({ success: true, connection: { status: connection.status } });
  } catch (err) {
    if (err instanceof PlanningCenterConnectionError) return NextResponse.json({ error: err.message }, { status: 404 });
    throw err;
  }
}
