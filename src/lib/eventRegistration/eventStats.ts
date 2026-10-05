import { prisma } from "@/lib/prisma";

export interface EventStats {
  registrations: number;
  attendees: number;
  checkedIn: number;
  /** Sum of confirmed registrations whose payment has not failed. Free registrations contribute 0. */
  revenueCents: number;
  /** Abandoned carts — PENDING registrations not yet paid. Informational. */
  pendingRegistrations: number;
}

const EMPTY: EventStats = { registrations: 0, attendees: 0, checkedIn: 0, revenueCents: 0, pendingRegistrations: 0 };
const FAILED_PAYMENT_STATUSES = new Set(["FAILED", "CANCELED", "CANCELLED", "REVERSED"]);

/** Dashboard numbers for one or many events — always scoped to `churchId`. */
export async function loadEventStats(churchId: string, eventIds: string[]): Promise<Map<string, EventStats>> {
  const out = new Map<string, EventStats>(eventIds.map((id) => [id, { ...EMPTY }]));
  if (eventIds.length === 0) return out;

  const [registrations, pending, checkedIn] = await Promise.all([
    prisma.eventRegistration.findMany({
      where: { churchId, eventId: { in: eventIds }, status: "CONFIRMED" },
      select: { eventId: true, attendeeCount: true, totalCents: true, paymentId: true },
    }),
    prisma.eventRegistration.groupBy({
      by: ["eventId"],
      where: { churchId, eventId: { in: eventIds }, status: "PENDING" },
      _count: { _all: true },
    }),
    prisma.eventAttendee.groupBy({
      by: ["eventId"],
      where: { churchId, eventId: { in: eventIds }, checkedIn: true },
      _count: { _all: true },
    }),
  ]);

  const paymentIds = [...new Set(registrations.map((r) => r.paymentId).filter((id): id is string => Boolean(id)))];
  const payments = paymentIds.length
    ? await prisma.payment.findMany({ where: { churchId, id: { in: paymentIds } }, select: { id: true, status: true } })
    : [];
  const paymentStatus = new Map(payments.map((p) => [p.id, p.status.toUpperCase()]));

  for (const r of registrations) {
    const s = out.get(r.eventId);
    if (!s) continue;
    s.registrations += 1;
    s.attendees += r.attendeeCount;
    const failed = r.paymentId ? FAILED_PAYMENT_STATUSES.has(paymentStatus.get(r.paymentId) ?? "") : false;
    if (r.paymentId && !failed) s.revenueCents += r.totalCents;
  }
  for (const p of pending) {
    const s = out.get(p.eventId);
    if (s) s.pendingRegistrations = p._count._all;
  }
  for (const c of checkedIn) {
    const s = out.get(c.eventId);
    if (s) s.checkedIn = c._count._all;
  }
  return out;
}
