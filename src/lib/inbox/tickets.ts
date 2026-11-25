import { prisma } from "@/lib/prisma";
import { createSupportTicketWithNumber } from "@/lib/support/ticketNumber";
import { guessCategory } from "@/lib/inbox/classify";

/**
 * Turns an inbox message into a SupportTicket for `churchId` (tickets always
 * belong to an org). Idempotent: a message that already has a ticket returns it.
 */
export async function createTicketFromInboxMessage(messageId: string, churchId: string, adminEmail: string | null) {
  const msg = await prisma.inboxMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error("Message not found");
  if (msg.ticketId) return { ticketId: msg.ticketId, created: false };

  const ticket = await createSupportTicketWithNumber({
    churchId,
    subject: msg.subject.slice(0, 200),
    category: guessCategory(`${msg.subject}\n${msg.bodyText}`),
    description: msg.bodyText.slice(0, 5000) || "(empty message)",
    priority: "NORMAL",
    preferredContactMethod: "EMAIL",
    contactEmail: msg.fromEmail,
    createdByEmail: msg.fromEmail,
  });
  await prisma.supportTicketMessage.create({
    data: { ticketId: ticket.id, senderRole: "church_admin", senderEmail: msg.fromEmail, body: msg.bodyText.slice(0, 10000) || "(empty message)" },
  });
  await prisma.inboxMessage.update({
    where: { id: msg.id },
    data: { ticketId: ticket.id, churchId, status: "TICKETED", handledByAdminEmail: adminEmail },
  });
  return { ticketId: ticket.id, created: true };
}

/** Adds an emailed reply to an existing ticket (matched by its WGC-#### number). */
export async function appendInboxMessageToTicket(messageId: string, ticketNumber: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { ticketNumber } });
  if (!ticket) return null;
  const msg = await prisma.inboxMessage.findUnique({ where: { id: messageId } });
  if (!msg || msg.ticketId) return msg?.ticketId ?? null;
  await prisma.supportTicketMessage.create({
    data: { ticketId: ticket.id, senderRole: "church_admin", senderEmail: msg.fromEmail, body: msg.bodyText.slice(0, 10000) || "(empty message)" },
  });
  await prisma.inboxMessage.update({ where: { id: msg.id }, data: { ticketId: ticket.id, churchId: ticket.churchId, status: "TICKETED" } });
  return ticket.id;
}
