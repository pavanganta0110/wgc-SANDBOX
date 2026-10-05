import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyTwilioSignature } from "@/lib/sms/twilioSignature";
import { isSmsConfigured, sendText } from "@/lib/sms/sendText";
import { normalizeKeyword, buildDefaultReplyMessage } from "@/lib/textToGive/keywordMatching";

/**
 * Text to Give's inbound webhook — a donor texts a keyword, gets a giving
 * link back. Deliberately reply-only: this never charges a card over SMS.
 *
 * Structurally complete but functionally inert today: isSmsConfigured()
 * mirrors sendText.ts's own hard guard, which stays false until
 * TWILIO_DONOR_FROM_NUMBER is deliberately set alongside a carrier-approved
 * A2P 10DLC campaign for this traffic (donor/fundraising SMS is NOT
 * approved on the existing 2FA-only campaign — see sendText.ts). Every
 * inbound hit is still logged for visibility even while inert.
 */
export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const rawBody = await req.text();
  const params = new URLSearchParams(rawBody);

  const headerList = await headers();
  const signature = headerList.get("x-twilio-signature");
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com"}/api/webhooks/twilio/inbound`;

  if (!authToken || !signature || !verifyTwilioSignature(authToken, callbackUrl, params, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  }

  const fromPhone = params.get("From") || "";
  const toPhone = params.get("To") || "";
  const rawBodyText = params.get("Body") || "";
  const keyword = normalizeKeyword(rawBodyText);

  const matched = keyword ? await prisma.textToGiveKeyword.findUnique({ where: { keyword } }) : null;
  const isActive = matched?.status === "ACTIVE";

  let replySent = false;
  let replyError: string | null = null;

  if (matched && isActive && isSmsConfigured()) {
    const [campaign, church] = await Promise.all([
      matched.fundraisingCampaignId ? prisma.fundraisingCampaign.findUnique({ where: { id: matched.fundraisingCampaignId } }) : null,
      prisma.church.findUnique({ where: { id: matched.churchId } }),
    ]);
    if (campaign && church) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
      const giveUrl = `${appUrl}/c/${campaign.slug}`;
      const message = matched.replyMessageTemplate || buildDefaultReplyMessage({ churchName: church.name, campaignName: campaign.name, giveUrl });
      const result = await sendText(fromPhone, message);
      replySent = result.success;
      replyError = result.success ? null : result.error ?? "Unknown error";
    }
  } else if (matched && !isSmsConfigured()) {
    replyError = "SMS sending is not yet configured for this environment.";
  }

  await prisma.textToGiveInboundMessage.create({
    data: { churchId: matched?.churchId ?? null, fromPhone, toPhone, body: rawBodyText, matchedKeywordId: matched?.id ?? null, replySent, replyError },
  });

  // Empty TwiML response — we reply via the REST API above (so we control
  // retries/logging), not via a synchronous <Message> in this response.
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
