import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { backfillDonorNormalization, backfillOrphanedPayments, backfillTransferCreatedVia } from "@/lib/donors/donorBackfill";

/**
 * Team-access Checkpoint 4D: this route is currently UNREACHABLE by design,
 * not by accident — it explicitly rejects wgc_admin (line below) while its
 * only granted permission (canTriggerSync) is wgc_admin-only in
 * donorPermissions.ts, so no caller can ever satisfy both checks. Per the
 * approved decision: kept disabled rather than rewired, since a real fix
 * (moving this wgc_admin-only backfill tool under /api/admin) is a new
 * system and out of scope here. See __tests__/backfillUnreachable.test.ts
 * for the executable proof.
 */
export async function POST(req: Request) {
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — this route passes
  // session.role into a permission module that has its own wgc_admin branch
  // (for legitimate internal-support use via getSession() elsewhere); without
  // this guard, a wgc_admin session could be admitted here through that back
  // door. requireMerchantSession() (not yet adopted by this route) would
  // reject this unconditionally; this is the minimal-diff equivalent.
  if (session?.role === "wgc_admin") {
    return NextResponse.json({ error: "This route is not available to internal accounts." }, { status: 403 });
  }
  const permissions = getDonorPermissions(session?.role);
  if (!session || !permissions.canTriggerSync) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const churchId = typeof body.churchId === "string" && body.churchId ? body.churchId : session.churchId;
  if (!churchId) {
    return NextResponse.json({ error: "churchId is required" }, { status: 400 });
  }

  const normalization = await backfillDonorNormalization(churchId);
  const orphanedPayments = await backfillOrphanedPayments(churchId);
  const createdVia = await backfillTransferCreatedVia(churchId);

  await logDashboardAction({
    churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "donor.backfill_run",
    entityType: "donor",
    metadata: { normalization, orphanedPayments, createdVia },
    req,
  });

  return NextResponse.json({ normalization, orphanedPayments, createdVia });
}
