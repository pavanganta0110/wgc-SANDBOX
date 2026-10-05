import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { isSmsAddonActive } from "@/lib/billing/smsAddonSubscriptionService";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { sendCampaignChunk } from "@/lib/giving/campaignSender";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.rawRole);
  if (!permissions.canView || !permissions.canSendStatements) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await prisma.givingCampaign.findFirst({ where: { id, churchId: auth.churchId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }
  if (campaign.status === "SENT") {
    return NextResponse.json({ done: true, campaign });
  }
  // Defense in depth — the create route already checked this before the
  // campaign existed, but a chunked send can span minutes and the add-on
  // subscription could lapse (payment failure, cancellation) between
  // chunks. Leaves remaining recipients PENDING rather than FAILED, since
  // this is a billing-state problem, not something wrong with the send.
  if (campaign.channel === "TEXT" && !(await isSmsAddonActive(auth.churchId))) {
    return NextResponse.json({ error: "Text messaging add-on is no longer active — resolve billing to continue sending." }, { status: 402 });
  }

  // Series templates are never sent themselves — only the monthly runs they create are.
  if (campaign.status === "SCHEDULED") {
    return NextResponse.json({ error: "This is a repeating campaign — it sends automatically on its schedule." }, { status: 400 });
  }

  const result = await sendCampaignChunk({ campaignId: campaign.id, churchId: auth.churchId, actorUserId: auth.userId });
  if (!result) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  if (result.done) {
    await logDashboardAction({
      churchId: auth.churchId,
      actorUserId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.rawRole,
      action: "giving_campaign.sent",
      entityType: "GivingCampaign",
      entityId: campaign.id,
      req,
    });
  }

  return NextResponse.json({ done: result.done, processed: result.processed, remaining: result.remaining, campaign: result.campaign });
}
