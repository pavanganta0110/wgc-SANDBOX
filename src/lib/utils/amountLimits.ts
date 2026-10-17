/**
 * Money columns in this schema are Postgres `integer` (4 bytes), so an amount above 2,147,483,647 cents (about $21.47M)
 * makes the database reject the write and the request fails as an opaque 500. Check before writing so the person gets
 * a clear message instead.
 */
export const POSTGRES_INT4_MAX = 2147483647;

/** A readable problem with a goal amount in cents, or null when it's fine (or not provided). */
export function goalAmountCentsError(value: unknown, label = "Goal amount"): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 0) return `${label} must be a valid, non-negative amount.`;
  if (value > POSTGRES_INT4_MAX) {
    return `${label} is too large. The maximum supported is $${(POSTGRES_INT4_MAX / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}.`;
  }
  return null;
}
