/**
 * Most Finix date fields are ISO 8601 strings, but a few (confirmed:
 * Subscription.next_billing_date) come back as a structured
 * { year, month, day } object instead — month is 1-indexed (human
 * convention), not JS's 0-indexed Date month. `new Date(thatObject)`
 * silently produces an Invalid Date rather than throwing, which Prisma
 * then rejects. This normalizes either shape, or returns null.
 */
export function parseFinixDate(value: unknown): Date | null {
  if (!value) return null;

  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "object" && value !== null && "year" in value && "month" in value && "day" in value) {
    const { year, month, day } = value as { year: number; month: number; day: number };
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
}
