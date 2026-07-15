import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { backfillDonorNormalization, backfillOrphanedPayments, backfillTransferCreatedVia } from "@/lib/donors/donorBackfill";

/**
 * Support action, wgc_admin only — always scoped to the CALLER'S resolved
 * organization (or an explicit churchId only wgc_admin may pass), never
 * "all organizations" in one call. There is no route that iterates every
 * organization in the database; a real all-org backfill would need to call
 * this once per organization, deliberately, with review between runs.
 */
export async function POST(req: Request) {
  const session = await getSession();
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
