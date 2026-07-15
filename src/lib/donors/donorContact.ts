const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Lowercased/trimmed for matching and storage in `normalizedEmail` — display value stays as entered. */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

export function isValidEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return EMAIL_PATTERN.test(email.trim());
}

/**
 * Normalizes a US phone number to E.164 (+1XXXXXXXXXX). Accepts 10 digits,
 * or 11 digits beginning with "1". Anything else (including a bank account
 * or routing number that got mapped into this field by mistake — those run
 * 8-17 digits with no leading "1" convention) is rejected rather than
 * guessed at, so a malformed source value never gets a false E.164 shape.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

export function isValidPhone(phone: string | null | undefined): boolean {
  return normalizePhone(phone) !== null;
}
