import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { encodeTicketPayload, parseTicketPayload } from "@/lib/eventRegistration/tickets";

/**
 * Public PNG of a ticket's QR code, used as an <img> in the confirmation
 * email and on the ticket page. Only renders for a token that exists, so
 * the endpoint can't be used as a generic QR generator.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = parseTicketPayload(raw);
  if (!token) return new Response("Not found", { status: 404 });
  const attendee = await prisma.eventAttendee.findUnique({ where: { ticketToken: token }, select: { id: true } });
  if (!attendee) return new Response("Not found", { status: 404 });

  const png = await QRCode.toBuffer(encodeTicketPayload(token), { type: "png", errorCorrectionLevel: "M", margin: 2, width: 480 });
  return new Response(new Uint8Array(png), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=86400" },
  });
}
