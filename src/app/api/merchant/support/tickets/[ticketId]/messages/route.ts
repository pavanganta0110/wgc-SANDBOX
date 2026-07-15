import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import { uploadTicketAttachment } from "@/lib/support/ticketAttachmentUpload";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await getSession();
  const permissions = getSupportPermissions(session?.role);
  if (!session || !session.churchId || !permissions.canReply) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket || ticket.churchId !== session.churchId) {
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
    const church = await prisma.church.findUnique({ where: { id: session.churchId }, select: { finixMerchantId: true } });
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
      senderRole: session.role,
      senderUserId: session.userId,
      senderEmail: session.email,
      body: body || "(Attachment)",
      attachments: attachment
        ? { create: [{ fileName: attachment.fileName, fileSize: attachment.fileSize, mimeType: attachment.mimeType, finixFileId: attachment.finixFileId }] }
        : undefined,
    },
    include: { attachments: true },
  });

  const newStatus = session.role === "wgc_admin" ? "WAITING_ON_ORGANIZATION" : "WAITING_ON_SUPPORT";
  await prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: newStatus } });

  await logDashboardAction({
    churchId: session.churchId,
    actorUserId: session.userId,
    actorEmail: session.email,
    actorRole: session.role,
    action: "support.ticket_message_sent",
    entityType: "support_ticket",
    entityId: ticket.id,
    metadata: { hasAttachment: !!attachment },
    req,
  });

  if (session.role === "wgc_admin") {
    const { notifyEvent } = await import("@/lib/settings/notificationDispatch");
    await notifyEvent({
      churchId: session.churchId,
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
