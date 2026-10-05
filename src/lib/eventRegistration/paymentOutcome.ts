import { prisma } from "@/lib/prisma";

/**
 * Keeps an event registration honest when its payment's status changes
 * after the fact. A bank (ACH) payment is accepted as PENDING, so the
 * registration is confirmed right away; if that payment later FAILS or is
 * RETURNED, the person has not actually paid, so the registration must stop
 * counting — it leaves attendee lists, check-in, revenue and email
 * audiences, and shows up under "Payment failed" for the merchant to
 * follow up on. If the payment is later corrected to SUCCEEDED (a
 * reconciliation catching up), the registration is restored. Nothing is
 * deleted either way, and card/wallet payments (decided instantly) never
 * pass through the failed branch.
 */

export const REGISTRATION_PAYMENT_FAILED = "PAYMENT_FAILED";
const UNPAID_PAYMENT_STATUSES = new Set(["FAILED", "CANCELED", "CANCELLED", "RETURNED", "REVERSED"]);

export function registrationStatusForPayment(paymentStatus: string, current: string): string | null {
  const status = paymentStatus.toUpperCase();
  if (UNPAID_PAYMENT_STATUSES.has(status) && current === "CONFIRMED") return REGISTRATION_PAYMENT_FAILED;
  if (status === "SUCCEEDED" && current === REGISTRATION_PAYMENT_FAILED) return "CONFIRMED";
  return null;
}

/** Call after a Payment's status is updated. Safe to call for any payment — a no-op unless an event registration points at it. */
export async function syncEventRegistrationWithPayment(churchId: string, paymentId: string, paymentStatus: string): Promise<void> {
  const registrations = await prisma.eventRegistration.findMany({
    where: { churchId, paymentId, status: { in: ["CONFIRMED", REGISTRATION_PAYMENT_FAILED] } },
    select: { id: true, status: true },
  });
  for (const r of registrations) {
    const next = registrationStatusForPayment(paymentStatus, r.status);
    if (!next) continue;
    await prisma.eventRegistration.updateMany({
      where: { id: r.id, churchId, status: r.status },
      data: {
        status: next,
        internalNote:
          next === REGISTRATION_PAYMENT_FAILED
            ? `Payment ${paymentStatus.toLowerCase()} on ${new Date().toISOString().slice(0, 10)} — follow up with the registrant.`
            : null,
      },
    });
  }
}
