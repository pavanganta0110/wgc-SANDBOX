import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { nextRunAfter } from "@/lib/giving/campaignSeries";

/** PATCH { action: "pause" | "resume" | "stop" } on a repeating campaign. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView || !permissions.canSendStatements) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const series = await prisma.givingCampaign.findFirst({ where: { id, churchId: auth.churchId, status: "SCHEDULED", repeatInterval: "MONTHLY" } });
  if (!series) return NextResponse.json({ error: "Repeating campaign not found." }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (action !== "pause" && action !== "resume" && action !== "stop") return NextResponse.json({ error: "Choose pause, resume or stop." }, { status: 400 });

  if (action === "pause") {
    await prisma.givingCampaign.updateMany({ where: { id, churchId: auth.churchId }, data: { repeatPausedAt: new Date() } });
  } else if (action === "resume") {
    // Never "catch up" the months missed while paused: if the next send date
    // is already in the past, move it forward to the next future occurrence.
    let next = series.nextRunAt ?? new Date();
    const day = series.repeatDayOfMonth ?? next.getUTCDate();
    let guard = 0;
    while (next.getTime() < Date.now() && guard++ < 36) next = nextRunAfter(next, day);
    await prisma.givingCampaign.updateMany({ where: { id, churchId: auth.churchId }, data: { repeatPausedAt: null, nextRunAt: next } });
  } else {
    await prisma.givingCampaign.updateMany({ where: { id, churchId: auth.churchId }, data: { status: "ENDED", nextRunAt: null, repeatPausedAt: null } });
  }

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: `giving_campaign.series_${action}`,
    entityType: "GivingCampaign",
    entityId: id,
    req,
  });
  const updated = await prisma.givingCampaign.findFirst({ where: { id, churchId: auth.churchId } });
  return NextResponse.json({ campaign: updated });
}
