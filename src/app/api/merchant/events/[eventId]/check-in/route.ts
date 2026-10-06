import { NextResponse } from "next/server";
import { validationError } from "@/lib/utils/validationError";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";
import { checkInByTicket, parseTicketPayload } from "@/lib/eventRegistration/tickets";

type Ctx = { params: Promise<{ eventId: string }> };

/**
 * Scan-to-check-in. Body: { code: string } — the raw text read from a ticket
 * QR (or a pasted ticket link). Always answers 200 with an `outcome` the
 * scanner screen turns into green / amber / red, so a bad ticket is a normal
 * result at the door, not an error.
 */
export async function POST(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canManageEventAttendees");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return notFoundResponse();

  const body = await req.json().catch(() => null);
  if (!body || typeof body.code !== "string") return validationError("A ticket code is required.");

  const token = parseTicketPayload(body.code);
  if (!token) return NextResponse.json({ outcome: "NOT_FOUND" });

  const result = await checkInByTicket({ churchId: auth.churchId, eventId: event.id, token, userId: auth.userId });
  return NextResponse.json(result);
}
