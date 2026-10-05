import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardEventsRoute, loadOwnedEvent, notFoundResponse } from "@/lib/eventRegistration/merchantGuard";

type Ctx = { params: Promise<{ eventId: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const guard = await guardEventsRoute("canViewEvents");
  if ("response" in guard) return guard.response;
  const { auth } = guard;
  const { eventId } = await params;

  const event = await loadOwnedEvent(auth.churchId, eventId);
  if (!event) return notFoundResponse();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const statusParam = searchParams.get("status");
  // Abandoned carts (PENDING) are noise in the list; they're only counted in stats.
  const status = statusParam === "CANCELED" || statusParam === "PAYMENT_FAILED" ? statusParam : "CONFIRMED";

  const registrations = await prisma.eventRegistration.findMany({
    where: {
      churchId: auth.churchId,
      eventId: event.id,
      status,
      ...(q
        ? {
            OR: [
              { registrantFirstName: { contains: q, mode: "insensitive" } },
              { registrantLastName: { contains: q, mode: "insensitive" } },
              { registrantEmail: { contains: q, mode: "insensitive" } },
              { confirmationCode: { contains: q.toUpperCase() } },
              { groupName: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const paymentIds = registrations.map((r) => r.paymentId).filter((id): id is string => Boolean(id));
  const payments = paymentIds.length
    ? await prisma.payment.findMany({ where: { churchId: auth.churchId, id: { in: paymentIds } }, select: { id: true, status: true } })
    : [];
  const paymentStatus = new Map(payments.map((p) => [p.id, p.status]));

  return NextResponse.json({
    registrations: registrations.map((r) => ({
      id: r.id,
      confirmationCode: r.confirmationCode,
      status: r.status,
      registrantName: `${r.registrantFirstName} ${r.registrantLastName}`.trim(),
      registrantEmail: r.registrantEmail,
      groupName: r.groupName,
      internalNote: r.internalNote,
      attendeeCount: r.attendeeCount,
      totalCents: r.totalCents,
      donationAmountCents: r.donationAmountCents,
      paymentId: r.paymentId,
      paymentStatus: r.paymentId ? (paymentStatus.get(r.paymentId) ?? "UNKNOWN") : r.totalCents > 0 ? "UNPAID" : "FREE",
      createdAt: r.createdAt.toISOString(),
    })),
  });
}
