import { prisma } from "@/lib/prisma";
import { computeBenefitValueCents } from "@/lib/eventRegistration/pricing";

/**
 * The checks the shared donate route runs when a payment claims to pay for
 * an event registration. Kept here (not inline in the route) so the rules
 * are unit-tested on their own: the registration must belong to this
 * church AND to this event's own dedicated giving link, must still be an
 * unpaid PENDING cart, and the amount being charged must equal the total
 * the server computed when the registration was created — the client's
 * amount is only ever compared, never trusted.
 */

export interface EventPaymentContext {
  registrationId: string;
  eventName: string;
  /** Value of what the registrant receives, for the tax-receipt split. */
  benefitValueCents: number;
}

export type EventPaymentGate =
  | { ok: true; ctx: EventPaymentContext }
  | { ok: false; status: number; message: string; retryable: boolean }
  | { ok: false; duplicate: { transferId: string | null; state: string } };

export async function gateEventPayment(params: {
  registrationId: string;
  churchId: string;
  givingLinkId: string;
  clientAttemptId: string;
  isRecurring: boolean;
  donationAmountCents: number;
}): Promise<EventPaymentGate> {
  const { churchId } = params;

  const registration = await prisma.eventRegistration.findFirst({ where: { id: params.registrationId, churchId } });
  const event = registration ? await prisma.event.findFirst({ where: { id: registration.eventId, churchId } }) : null;
  if (!registration || !event || event.givingLinkId !== params.givingLinkId) {
    return { ok: false, status: 404, message: "This registration could not be found. Please refresh and try again.", retryable: false };
  }

  if (registration.status !== "PENDING" || registration.paymentId) {
    // A double-click / retried request for the SAME attempt that already
    // went through must read as the original success, not as an
    // "already completed" failure.
    const prior = await prisma.paymentAttempt.findUnique({ where: { clientAttemptId: params.clientAttemptId } });
    if (prior && (prior.status === "SUCCEEDED" || prior.status === "PENDING")) {
      return { ok: false, duplicate: { transferId: prior.finixTransferId ?? null, state: prior.status } };
    }
    return { ok: false, status: 409, message: "This registration has already been completed.", retryable: false };
  }

  if (params.isRecurring) {
    return { ok: false, status: 400, message: "Event registrations can't be paid on a recurring schedule.", retryable: false };
  }
  if (params.donationAmountCents !== registration.totalCents) {
    return { ok: false, status: 400, message: "The registration total has changed. Please refresh and try again.", retryable: true };
  }

  const [lines, addOns] = await Promise.all([
    prisma.eventRegistrationAddOn.findMany({ where: { registrationId: registration.id, churchId } }),
    prisma.eventAddOn.findMany({ where: { eventId: event.id, churchId } }),
  ]);
  const fmvByAddOn = new Map(addOns.map((a) => [a.id, a.fmvCents]));

  return {
    ok: true,
    ctx: {
      registrationId: registration.id,
      eventName: event.name,
      benefitValueCents: computeBenefitValueCents({
        event,
        attendeeCount: registration.attendeeCount,
        lines: lines.map((l) => ({ unitPriceCents: l.unitPriceCents, quantity: l.quantity, fmvCents: fmvByAddOn.get(l.addOnId) ?? null })),
      }),
    },
  };
}
