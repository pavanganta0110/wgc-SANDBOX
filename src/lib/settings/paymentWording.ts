import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { toPaymentWording } from "@/lib/settings/paymentMode";

/**
 * For merchant dashboard server components: the signed-in organization's
 * payment-mode flag and a `pw()` that turns donation-style labels ("Donor",
 * "Giving Links") into payment wording when the flag is on, and returns them
 * untouched when it is off. Wording only — never changes data or behavior.
 *
 * Cached per request, so any number of components can call it for one query.
 * The organization always comes from the session (including a WGC admin's
 * "view as merchant" session), never from a client-supplied value.
 */
export const getPaymentWording = cache(async () => {
  let paymentMode = false;
  try {
    const auth = await requireMerchantSession(true);
    const church = await prisma.church.findUnique({ where: { id: auth.churchId }, select: { paymentMode: true } });
    paymentMode = Boolean(church?.paymentMode);
  } catch {
    // Not a merchant session (or a transient lookup failure): fall back to the normal wording.
  }
  const pw = (text: string) => (paymentMode ? toPaymentWording(text) : text);
  return { paymentMode, pw };
});
