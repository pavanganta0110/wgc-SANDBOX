import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { normalizeKeyword } from "@/lib/textToGive/keywordMatching";
import { isSmsConfigured } from "@/lib/sms/sendText";

export async function GET() {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const keywords = await prisma.textToGiveKeyword.findMany({ where: { churchId: auth.churchId }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ keywords, smsLive: isSmsConfigured() });
}

export async function POST(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const keyword = normalizeKeyword(typeof body.keyword === "string" ? body.keyword : "");
  const fundraisingCampaignId = typeof body.fundraisingCampaignId === "string" ? body.fundraisingCampaignId : null;
  const replyMessageTemplate = typeof body.replyMessageTemplate === "string" ? body.replyMessageTemplate.trim() || null : null;

  if (!keyword || keyword.length < 2) return NextResponse.json({ error: "Keyword must be at least 2 letters/numbers." }, { status: 400 });
  if (!fundraisingCampaignId) return NextResponse.json({ error: "A campaign is required." }, { status: 400 });

  const campaign = await prisma.fundraisingCampaign.findFirst({ where: { id: fundraisingCampaignId, churchId: auth.churchId } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const existing = await prisma.textToGiveKeyword.findUnique({ where: { keyword } });
  if (existing) return NextResponse.json({ error: `"${keyword}" is already taken. Try another keyword.` }, { status: 409 });

  const created = await prisma.textToGiveKeyword.create({
    data: { churchId: auth.churchId, keyword, fundraisingCampaignId, givingLinkId: campaign.givingLinkId, replyMessageTemplate, status: "ACTIVE", createdByUserId: auth.userId },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "text_to_give_keyword.created",
    entityType: "TextToGiveKeyword",
    entityId: created.id,
    metadata: { keyword },
    req,
  });

  return NextResponse.json({ keyword: created });
}
