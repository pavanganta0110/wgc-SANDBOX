import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { sendWgcEmail } from "@/lib/email";
import { sendText, isSmsConfigured } from "@/lib/sms/sendText";
import { isValidEmail, normalizeUSPhone } from "@/lib/validation";

const CHANNELS = new Set(["COPY_LINK", "QR_CODE", "EMAIL", "TEXT", "MANUAL", "EMBED"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session.role !== "church_admin" || !session.churchId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;

  const link = await prisma.givingLink.findFirst({ where: { id, churchId: session.churchId } });
  if (!link) return NextResponse.json({ error: "Giving link not found" }, { status: 404 });

  const body = await req.json();
  const { channel, recipient, message, subject } = body;

  if (!CHANNELS.has(channel)) {
    return NextResponse.json({ error: "Invalid share channel" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://wgcpayments.com";
  const publicUrl = `${appUrl}/g/${link.publicSlug}`;
  const church = await prisma.church.findUnique({ where: { id: session.churchId } });

  if (channel === "COPY_LINK" || channel === "QR_CODE" || channel === "MANUAL" || channel === "EMBED") {
    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: session.churchId,
        sharedByUserId: session.userId,
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

    const emailSubject = subject?.trim() || `${church?.name || "We"}'d love your support`;
    const bodyHtml = `
      <p>${message?.trim() ? message.trim().replace(/\n/g, "<br/>") : `${church?.name || "Our organization"} invites you to give online.`}</p>
      <p><a href="${publicUrl}">${link.publicTitle}</a></p>
    `;

    const result = await sendWgcEmail({
      to: recipient,
      subject: emailSubject,
      title: link.publicTitle,
      badgeText: "Giving Link",
      badgeColor: "#eab308",
      bodyHtml,
    });

    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: session.churchId,
        sharedByUserId: session.userId,
        channel: "EMAIL",
        recipient,
        message: message?.trim() || null,
        state: result.success ? "SENT" : "FAILED",
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: "Failed to send email", share }, { status: 502 });
    }
    return NextResponse.json({ share, publicUrl });
  }

  if (channel === "TEXT") {
    if (!isSmsConfigured()) {
      return NextResponse.json({ error: "Text messaging is not configured for this organization." }, { status: 400 });
    }
    const normalized = recipient ? normalizeUSPhone(recipient) : null;
    if (!normalized) {
      return NextResponse.json({ error: "Please enter a valid U.S. phone number" }, { status: 400 });
    }

    const smsBody = message?.trim() ? `${message.trim()} ${publicUrl}` : `${link.publicTitle}: ${publicUrl}`;
    const result = await sendText(normalized, smsBody);

    const share = await prisma.givingLinkShare.create({
      data: {
        givingLinkId: id,
        churchId: session.churchId,
        sharedByUserId: session.userId,
        channel: "TEXT",
        recipient: normalized,
        message: message?.trim() || null,
        state: result.success ? "SENT" : "FAILED",
      },
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Failed to send text", share }, { status: 502 });
    }
    return NextResponse.json({ share, publicUrl });
  }

  return NextResponse.json({ error: "Unhandled channel" }, { status: 400 });
}
