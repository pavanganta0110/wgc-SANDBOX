import { formatCents } from "@/lib/format";

/**
 * $1.2k / $4.6M for axis ticks and tight spaces; exact amounts use formatCents.
 * Hand-rolled (not Intl compact) so the server and the browser always print the same string.
 */
export function compactMoney(cents: number): string {
  const dollars = Math.abs(cents / 100);
  const sign = cents < 0 ? "-" : "";
  const trim = (n: number) => (Math.round(n * 10) / 10).toString();
  if (dollars < 1000) return `${sign}$${Math.round(dollars)}`;
  if (dollars < 1_000_000) return `${sign}$${trim(dollars / 1000)}k`;
  return `${sign}$${trim(dollars / 1_000_000)}M`;
}

export function percent(n: number): string {
  if (n > 0 && n < 1) return "<1%";
  return `${Math.round(n)}%`;
}

export { formatCents };
