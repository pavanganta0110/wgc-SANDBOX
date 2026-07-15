export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

/** Negative amounts shown parenthesized (e.g. "($14.95) USD") instead of with a minus sign. */
export function formatSignedCents(cents: number | null | undefined) {
  const value = cents ?? 0;
  const formatted = formatCents(Math.abs(value));
  return value < 0 ? `(${formatted}) USD` : `${formatted} USD`;
}
