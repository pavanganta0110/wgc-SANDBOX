import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { uploadTicketAttachment } from "@/lib/support/ticketAttachmentUpload";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getSupportPermissions(auth.rawRole);
  if (!permissions.canReply) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.churchId !== auth.churchId || (!permissions.canViewAllTickets && ticket.createdByUserId !== auth.userId)) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }
  if (["RESOLVED", "CLOSED"].includes(ticket.status)) {
    return NextResponse.json({ error: "This ticket is closed. Reopen it to send a new message." }, { status: 400 });
  }

  const formData = await req.formData();
  const body = (formData.get("body") as string | null)?.trim() || "";
  const file = formData.get("file") as File | null;

  if (!body && !file) {
    return NextResponse.json({ error: "Enter a message or attach a file" }, { status: 400 });
  }

  let attachment: Awaited<ReturnType<typeof uploadTicketAttachment>> | null = null;
  if (file && file.size > 0) {
    if (!permissions.canUploadAttachment) {
      return NextResponse.json({ error: "Unauthorized to upload attachments" }, { status: 401 });
    }
    const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { finixMerchantId: true } });
    if (!church?.finixMerchantId) {
      return NextResponse.json({ error: "Attachments aren't available for this organization yet" }, { status: 400 });
    }
    try {
      attachment = await uploadTicketAttachment(file, church.finixMerchantId);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Failed to upload attachment" }, { status: 400 });
    }
  }

  const message = await prisma.supportTicketMessage.create({
    data: {
      ticketId: ticket.id,
      senderRole: auth.rawRole,
      senderUserId: auth.userId,
      senderEmail: auth.email,
      body: body || "(Attachment)",
      attachments: attachment
        ? { create: [{ fileName: attachment.fileName, fileSize: attachment.fileSize, mimeType: attachment.mimeType, finixFileId: attachment.finixFileId }] }
        : undefined,
    },
    include: { attachments: true },
  });

  const newStatus = auth.rawRole === "wgc_admin" ? "WAITING_ON_ORGANIZATION" : "WAITING_ON_SUPPORT";
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: newStatus } });

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "support.ticket_message_sent",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { hasAttachment: !!attachment },
    req,
  });

  if (auth.rawRole === "wgc_admin") {
    const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
    await notifyEvent({
      churchId: auth.churchId,
      eventKey: "SUPPORT_TICKET_REPLY",
      subject: `WGC Support replied: ${ticket.subject}`,
      title: "Support Ticket Reply",
      badgeText: "New Reply",
      badgeColor: "#0B5DBC",
      bodyHtml: `<p>WGC Support has replied to your ticket "<strong>${ticket.subject}</strong>".</p><p><a href="https://wgcpayments.com/merchant/support/tickets/${ticket.id}">View ticket</a></p>`,
    });
  }

  return NextResponse.json({ message }, { status: 201 });
}
