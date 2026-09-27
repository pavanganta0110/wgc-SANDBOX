/**
 * "Default Donation Type" / "Default Recurring Amount" for a Giving Form
 * (GivingLink) — what the public form opens on. Purely a starting point:
 * the donor can always switch between One-Time and Recurring, pick another
 * suggested amount, or type a custom one. Every existing link defaults to
 * ONE_TIME / no amount, i.e. exactly today's behavior.
 *
 * Shared by the create/update API routes (validation + normalization) and
 * the public form (resolveInitialDonationState), so what an organization
 * is allowed to save and what a donor is shown can never disagree.
 */

export const DEFAULT_DONATION_TYPES = ["ONE_TIME", "RECURRING"] as const;
export type DefaultDonationType = (typeof DEFAULT_DONATION_TYPES)[number];

const MIN_DEFAULT_AMOUNT_CENTS = 100;
const FALLBACK_INITIAL_AMOUNT_CENTS = 2500;

/** Anything missing/unrecognized (including every pre-existing row and stale cached config) means ONE_TIME. */
export function parseDefaultDonationType(value: unknown): DefaultDonationType {
  return value === "RECURRING" ? "RECURRING" : "ONE_TIME";
}

type AmountType = "FIXED" | "VARIABLE" | "FIXED_QUANTITY";

export interface DefaultDonationSettingsInput {
  defaultDonationType: unknown;
  defaultRecurringAmountCents: unknown;
  // Effective values of the surrounding link configuration (after applying
  // any pending changes) — the defaults must be valid against these.
  recurringEnabled: boolean;
  amountType: AmountType;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  suggestedAmountsCents: number[];
  allowCustomAmount: boolean;
}

export type DefaultDonationSettingsResult =
  | { ok: true; value: { defaultDonationType: DefaultDonationType; defaultRecurringAmountCents: number | null } }
  | { ok: false; error: string };

export function validateDefaultDonationSettings(input: DefaultDonationSettingsInput): DefaultDonationSettingsResult {
  const rawType = input.defaultDonationType;
  if (rawType != null && rawType !== "" && !(DEFAULT_DONATION_TYPES as readonly unknown[]).includes(rawType)) {
    return { ok: false, error: "Default donation type must be One-Time or Recurring." };
  }
  const defaultDonationType = parseDefaultDonationType(rawType);

  if (defaultDonationType === "RECURRING" && !input.recurringEnabled) {
    return { ok: false, error: 'Turn on "Allow recurring giving" before making Recurring the default donation type.' };
  }

  const rawAmount = input.defaultRecurringAmountCents;
  const hasAmount = rawAmount != null && rawAmount !== "";
  let amount: number | null = null;
  if (hasAmount) {
    if (typeof rawAmount !== "number" || !Number.isInteger(rawAmount) || rawAmount < MIN_DEFAULT_AMOUNT_CENTS) {
      return { ok: false, error: "Default recurring amount must be at least $1.00." };
    }
    amount = rawAmount;
  }

  // The default recurring amount only means something when Recurring is the
  // default and the donor is choosing an amount at all (a FIXED price or a
  // FIXED_QUANTITY total isn't pre-selectable) — normalized away otherwise
  // rather than rejected, so switching those settings never traps a save.
  if (defaultDonationType !== "RECURRING" || input.amountType !== "VARIABLE") {
    return { ok: true, value: { defaultDonationType, defaultRecurringAmountCents: null } };
  }

  if (amount != null) {
    if (input.minAmountCents != null && amount < input.minAmountCents) {
      return { ok: false, error: "Default recurring amount is below this form's minimum amount." };
    }
    if (input.maxAmountCents != null && amount > input.maxAmountCents) {
      return { ok: false, error: "Default recurring amount is above this form's maximum amount." };
    }
    if (!input.allowCustomAmount && !input.suggestedAmountsCents.includes(amount)) {
      return { ok: false, error: "With custom amounts turned off, the default recurring amount must be one of the suggested amounts." };
    }
  }

  return { ok: true, value: { defaultDonationType, defaultRecurringAmountCents: amount } };
}

export interface InitialDonationStateParams {
  recurringEnabled: boolean;
  allowedFrequencies: readonly unknown[];
  defaultDonationType: unknown;
  defaultRecurringAmountCents: number | null | undefined;
  amountType: AmountType;
  fixedAmountCents: number | null;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  suggestedAmountsCents: number[];
  allowCustomAmount: boolean;
}

export interface InitialDonationState {
  isRecurring: boolean;
  /** Selected suggested-amount button (or the fixed amount). */
  amountCents: number;
  /** Non-empty only when the default amount isn't a suggested one and is entered as a custom amount. */
  customAmount: string;
  /** The default recurring amount actually applied (null when none, or when it couldn't be honored) — lets other renderers, like the embed widget, pre-select it without re-deriving the rules. */
  appliedDefaultAmountCents: number | null;
}

function centsToInputValue(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? String(dollars) : dollars.toFixed(2);
}

/**
 * What the public form opens on. Re-checks everything the API already
 * validated at save time, so a stale or hand-edited row can never open the
 * form on an unavailable option: Recurring is only the starting point when
 * recurring giving is actually on, and the default amount is only used when
 * the donor could really have selected it.
 */
export function resolveInitialDonationState(params: InitialDonationStateParams): InitialDonationState {
  const baseAmountCents = params.fixedAmountCents ?? params.suggestedAmountsCents[0] ?? FALLBACK_INITIAL_AMOUNT_CENTS;

  const isRecurring =
    params.recurringEnabled && params.allowedFrequencies.length > 0 && parseDefaultDonationType(params.defaultDonationType) === "RECURRING";

  const amount = params.defaultRecurringAmountCents;
  const notApplied: InitialDonationState = { isRecurring, amountCents: baseAmountCents, customAmount: "", appliedDefaultAmountCents: null };
  if (!isRecurring || params.amountType !== "VARIABLE" || amount == null || !Number.isInteger(amount) || amount < MIN_DEFAULT_AMOUNT_CENTS) {
    return notApplied;
  }
  if (params.minAmountCents != null && amount < params.minAmountCents) return notApplied;
  if (params.maxAmountCents != null && amount > params.maxAmountCents) return notApplied;

  if (params.suggestedAmountsCents.includes(amount)) {
    return { isRecurring, amountCents: amount, customAmount: "", appliedDefaultAmountCents: amount };
  }
  if (params.allowCustomAmount) {
    return { isRecurring, amountCents: baseAmountCents, customAmount: centsToInputValue(amount), appliedDefaultAmountCents: amount };
  }
  return notApplied;
}
