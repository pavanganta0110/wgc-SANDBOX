/**
 * Server-authoritative registration pricing. The client shows a live total
 * for convenience, but the amount actually charged is ALWAYS recomputed here
 * from the event's configured price, the active add-ons the registrant
 * selected, and the optional donation — a tampered client total can never
 * change what's owed. Pure and framework-free so the exact same function
 * is unit-tested, used by the register API, and mirrored by the form.
 */

/** Smallest amount the existing donate flow will charge ($1.00). */
export const MIN_CHARGE_CENTS = 100;
/** Hard ceiling on a single registration total — far above any real event, well inside Postgres int4. */
export const MAX_TOTAL_CENTS = 100_000_000; // $1,000,000.00
export const MAX_DONATION_CENTS = 100_000_000;

export interface PricingEvent {
  priceCents: number;
  priceMode: string; // PER_ATTENDEE | PER_REGISTRATION
  registrationFmvCents: number | null;
  allowOptionalDonation: boolean;
}

export interface PricingAddOn {
  id: string;
  name: string;
  priceCents: number;
  fmvCents: number | null;
  maxQuantity: number;
  isActive: boolean;
}

export interface AddOnSelection {
  addOnId: string;
  quantity: number;
}

export interface PricedAddOnLine {
  addOnId: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface RegistrationTotals {
  attendeeCount: number;
  registrationAmountCents: number;
  addOnLines: PricedAddOnLine[];
  addOnsAmountCents: number;
  donationAmountCents: number;
  totalCents: number;
  /** Value the registrant receives in exchange for the non-donation charges (quid-pro-quo). */
  benefitValueCents: number;
  /** totalCents - benefitValueCents: the portion recorded as a charitable contribution. */
  contributionCents: number;
}

export type PricingResult = { ok: true; totals: RegistrationTotals } | { ok: false; error: string };

export function registrationUnits(event: Pick<PricingEvent, "priceMode">, attendeeCount: number): number {
  return event.priceMode === "PER_REGISTRATION" ? 1 : attendeeCount;
}

export function computeRegistrationTotals(input: {
  event: PricingEvent;
  attendeeCount: number;
  addOns: PricingAddOn[];
  selections: AddOnSelection[];
  donationCents: number;
}): PricingResult {
  const { event, attendeeCount, addOns, selections } = input;
  const donationCents = input.donationCents;

  if (!Number.isInteger(attendeeCount) || attendeeCount < 1) {
    return { ok: false, error: "At least one attendee is required." };
  }
  if (!Number.isInteger(donationCents) || donationCents < 0) {
    return { ok: false, error: "The additional gift must be a valid amount." };
  }
  if (donationCents > 0 && !event.allowOptionalDonation) {
    return { ok: false, error: "This event does not accept an additional gift." };
  }
  if (donationCents > MAX_DONATION_CENTS) {
    return { ok: false, error: "The additional gift amount is too large." };
  }

  const units = registrationUnits(event, attendeeCount);
  const registrationAmountCents = event.priceCents * units;
  const registrationFmvPerUnit = Math.min(event.registrationFmvCents ?? event.priceCents, event.priceCents);
  let benefitValueCents = registrationFmvPerUnit * units;

  const byId = new Map(addOns.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const addOnLines: PricedAddOnLine[] = [];
  let addOnsAmountCents = 0;

  for (const sel of selections) {
    if (seen.has(sel.addOnId)) return { ok: false, error: "An add-on was selected more than once." };
    seen.add(sel.addOnId);
    const addOn = byId.get(sel.addOnId);
    if (!addOn || !addOn.isActive) return { ok: false, error: "A selected add-on is no longer available." };
    if (!Number.isInteger(sel.quantity) || sel.quantity < 1) {
      return { ok: false, error: `Choose a valid quantity for "${addOn.name}".` };
    }
    if (sel.quantity > addOn.maxQuantity) {
      return { ok: false, error: `You can add at most ${addOn.maxQuantity} of "${addOn.name}".` };
    }
    const lineTotalCents = addOn.priceCents * sel.quantity;
    addOnLines.push({
      addOnId: addOn.id,
      name: addOn.name,
      unitPriceCents: addOn.priceCents,
      quantity: sel.quantity,
      lineTotalCents,
    });
    addOnsAmountCents += lineTotalCents;
    benefitValueCents += Math.min(addOn.fmvCents ?? addOn.priceCents, addOn.priceCents) * sel.quantity;
  }

  const totalCents = registrationAmountCents + addOnsAmountCents + donationCents;
  if (totalCents > MAX_TOTAL_CENTS) {
    return { ok: false, error: "This registration total is too large to process online." };
  }
  if (totalCents > 0 && totalCents < MIN_CHARGE_CENTS) {
    return { ok: false, error: "The minimum online payment is $1.00. Remove the small charge or increase the amount." };
  }

  return {
    ok: true,
    totals: {
      attendeeCount,
      registrationAmountCents,
      addOnLines,
      addOnsAmountCents,
      donationAmountCents: donationCents,
      totalCents,
      benefitValueCents,
      contributionCents: Math.max(0, totalCents - benefitValueCents),
    },
  };
}

/**
 * The quid-pro-quo "benefit value" of a stored registration — recomputed
 * from the event's current FMV settings plus what was actually bought, so
 * the donate route never has to trust a client-supplied figure. Mirrors
 * the benefit math inside computeRegistrationTotals.
 */
export function computeBenefitValueCents(input: {
  event: Pick<PricingEvent, "priceCents" | "priceMode" | "registrationFmvCents">;
  attendeeCount: number;
  lines: { unitPriceCents: number; quantity: number; fmvCents: number | null }[];
}): number {
  const units = registrationUnits(input.event, input.attendeeCount);
  const registrationFmvPerUnit = Math.min(input.event.registrationFmvCents ?? input.event.priceCents, input.event.priceCents);
  let benefit = registrationFmvPerUnit * units;
  for (const line of input.lines) {
    benefit += Math.min(line.fmvCents ?? line.unitPriceCents, line.unitPriceCents) * line.quantity;
  }
  return benefit;
}
