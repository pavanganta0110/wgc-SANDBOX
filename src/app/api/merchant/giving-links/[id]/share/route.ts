import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { sendText, isSmsConfigured } from "@/lib/sms/sendText";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";

const CHANNELS = new Set(["COPY_LINK", "QR_CODE", "EMAIL", "TEXT", "MANUAL", "EMBED"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const { id } = await params;

  const link = await prisma.givingLink.findFirst({ where: { id, churchId: auth.churchId } });
  if (!link) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const body = await req.json();
  const { channel, recipient, message, subject } = body;

  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Invalid share channel" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.wgcpayments.com";
  const publicUrl = `${appUrl}/g/${link.publicSlug}`;
  const church = await prisma.church.findUnique({ where: { id: auth.churchId } });

  if (channel === "COPY_LINK" || channel === "QR_CODE" || channel === "MANUAL" || channel === "EMBED") {
    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: auth.churchId,
        sharedByUserId: auth.userId,
        channel,
        recipient: null,
        state: "SENT",
      },
    });
    return NextResponse.json({ share, publicUrl });
  }

  if (channel === "EMAIL") {
    if (!recipient || !isValidEmail(recipient)) {
      return NextResponse.json({ error: "Please enter a valid email address" }, { status: 400 });
    }

    // Created before sending (state: PENDING) so the share's own id can be
    // embedded in the link the recipient actually clicks — that's what
    // lets the public giving page record a real "Opened" event back onto
    // this exact share row (see /g/[slug]/page.tsx).
    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: auth.churchId,
        sharedByUserId: auth.userId,
        channel: "EMAIL",
        recipient,
        message: message?.trim() || null,
        state: "PENDING",
      },
    });
    const trackedUrl = `${publicUrl}?share=${share.id}`;

    const emailSubject = subject?.trim() || `${church?.name || "We"}'d love your support`;
    const bodyHtml = `
      <p>${message?.trim() ? message.trim().replace(/\n/g, "<br/>") : `${church?.name || "Our organization"} invites you to give online.`}</p>
      <p><a href="${trackedUrl}">${link.publicTitle}</a></p>
    `;

    const result = await sendWgcEmail({
      to: recipient,
      subject: emailSubject,
      title: link.publicTitle,
      badgeText: "Giving Link",
      badgeColor: "#eab308",
      bodyHtml,
    });

    const updatedShare = await prisma.givingLinkShare.update({
      where: { id: share.id },
      data: { state: result.success ? "SENT" : "FAILED" },
    });

    if (!result.success) {
      return NextResponse.json({ error: "Failed to send email", share: updatedShare }, { status: 502 });
    }
    return NextResponse.json({ share: updatedShare, publicUrl });
  }

  if (channel === "TEXT") {
    if (!isSmsConfigured()) {
      return NextResponse.json({ error: "Text messaging is not configured for this organization." }, { status: 400 });
    }
    const normalized = recipient ? normalizeUSPhone(recipient) : null;
    if (!normalized) {
      return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
    }

    // Same reasoning as EMAIL above — the share row must exist before
    // sending so its id can be embedded in the link for click-through
    // open tracking.
    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: auth.churchId,
        sharedByUserId: auth.userId,
        channel: "TEXT",
        recipient: normalized,
        message: message?.trim() || null,
        state: "PENDING",
      },
    });
    const trackedUrl = `${publicUrl}?share=${share.id}`;

    const smsBody = message?.trim() ? `${message.trim()} ${trackedUrl}` : `${link.publicTitle}: ${trackedUrl}`;
    const result = await sendText(normalized, smsBody);

    const updatedShare = await prisma.givingLinkShare.update({
      where: { id: share.id },
      data: { state: result.success ? "SENT" : "FAILED" },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send text", share: updatedShare }, { status: 502 });
    }
    return NextResponse.json({ share: updatedShare, publicUrl });
  }

  return NextResponse.json({ error: "Unhandled channel" }, { status: 400 });
}
