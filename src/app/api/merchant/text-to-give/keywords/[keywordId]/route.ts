import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function PATCH(req: Request, { params }: { params: Promise<{ keywordId: string }> }) {
  const { keywordId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.textToGiveKeyword.findFirst({ where: { id: keywordId, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const { status, replyMessageTemplate } = body;
  if (status !== undefined && !["ACTIVE", "PAUSED"].includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const updated = await prisma.textToGiveKeyword.update({
    where: { id: keywordId },
    data: {
      ...(status !== undefined ? { status } : {}),
      ...(replyMessageTemplate !== undefined ? { replyMessageTemplate: replyMessageTemplate ? String(replyMessageTemplate).trim() : null } : {}),
    },
  });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "text_to_give_keyword.updated",
    entityType: "TextToGiveKeyword",
    entityId: keywordId,
    metadata: { changes: Object.keys(body) },
    req,
  });

  return NextResponse.json({ keyword: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ keywordId: string }> }) {
  const { keywordId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canEditFundraisingCampaign");
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const existing = await prisma.textToGiveKeyword.findFirst({ where: { id: keywordId, churchId: auth.churchId } });
  if (!existing) return NextResponse.json({ error: "Keyword not found" }, { status: 404 });

  await prisma.textToGiveKeyword.delete({ where: { id: keywordId } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    action: "text_to_give_keyword.deleted",
    entityType: "TextToGiveKeyword",
    entityId: keywordId,
    metadata: { keyword: existing.keyword },
    req,
  });

  return NextResponse.json({ ok: true });
}
