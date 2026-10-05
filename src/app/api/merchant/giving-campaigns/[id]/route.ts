import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!getDonorPermissions(auth.rawRole).canView) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const campaign = await prisma.givingCampaign.findFirst({ where: { id, churchId: auth.churchId } });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const recipients = await prisma.givingCampaignRecipient.findMany({
    where: { campaignId: campaign.id, churchId: auth.churchId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      recipientName: true,
      recipientEmail: true,
      recipientPhone: true,
      sendStatus: true,
      sendError: true,
      sentAt: true,
      clickedAt: true,
      paidAt: true,
      paymentId: true,
    },
  });

  return NextResponse.json({ campaign, recipients });
}
