/**
 * Groups Finix's raw fee rows into the charges an organization recognizes, so Insights can list every fee that
 * actually applied and nothing that did not. Fee types come from the organization's fee profile and can appear later
 * (an ACH return, a chargeback, bank-account validation, a same-day payout, a refund fee once that setting is turned
 * on). A fee type we do not recognize is still listed, under a readable name, so a new charge is never hidden.
 */
export interface FeeTypeRow {
  key: string;
  label: string;
  /** Number of fee charges in the period. */
  count: number;
  /** Total for the period, in cents (rounded once per group, never per charge). */
  amountCents: number;
  /** True for a fee Finix charges when it pays out to the bank. */
  isPayoutFee: boolean;
}

interface Classified {
  key: string;
  label: string;
  isPayoutFee: boolean;
}

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

/** Readable fallback for a fee type we have no wording for: "SOME_NEW_FEE" -> "Some New Fee". */
function readable(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export function classifyFeeType(rawFeeType: string | null | undefined): Classified {
  const raw = (rawFeeType ?? "").trim();
  const t = raw.toUpperCase();
  if (!t) return { key: "OTHER", label: "Other fees", isPayoutFee: false };

  const direction = has(t, "CREDIT") ? " (credit)" : has(t, "DEBIT") ? " (debit)" : "";

  // Charges on the payout to the bank (the settlement's own funding transfer).
  if (has(t, "SETTLEMENT_FUNDING", "FUNDING_TRANSFER", "FUNDING")) {
    if (has(t, "RETURN")) return { key: "PAYOUT_RETURN" + direction, label: `Payout return fee${direction}`, isPayoutFee: true };
    if (has(t, "NOC")) return { key: "PAYOUT_NOC" + direction, label: `Payout correction (NOC) fee${direction}`, isPayoutFee: true };
    if (has(t, "SAME_DAY", "SAMEDAY")) return { key: "PAYOUT_SAME_DAY", label: "Same-day payout fee", isPayoutFee: true };
    return { key: "PAYOUT", label: "Payout fee", isPayoutFee: true };
  }
  if (has(t, "INSTANT")) return { key: "PAYOUT_INSTANT", label: "Instant payout fee", isPayoutFee: true };

  if (has(t, "CHARGEBACK", "DISPUTE")) {
    if (has(t, "INQUIR")) return { key: "CHARGEBACK_INQUIRY", label: "Chargeback inquiry fee", isPayoutFee: false };
    if (has(t, "NOTIF")) return { key: "CHARGEBACK_NOTIFICATION", label: "Chargeback notification fee", isPayoutFee: false };
    return { key: "CHARGEBACK", label: "Chargeback fee", isPayoutFee: false };
  }
  if (has(t, "RETURN")) return { key: "ACH_RETURN" + direction, label: `ACH return fee${direction}`, isPayoutFee: false };
  if (has(t, "NOC")) return { key: "ACH_NOC" + direction, label: `ACH correction (NOC) fee${direction}`, isPayoutFee: false };
  if (has(t, "VALIDATION", "PLAID", "VERIFICATION")) {
    return { key: "ACCOUNT_VALIDATION", label: "Bank account validation (Plaid)", isPayoutFee: false };
  }
  if (has(t, "UPDATER")) return { key: "ACCOUNT_UPDATER", label: "Card account updater", isPayoutFee: false };
  if (has(t, "PCI", "COMPLIANCE")) return { key: "PCI", label: "PCI compliance fee", isPayoutFee: false };
  if (has(t, "REFUND")) return { key: "REFUND", label: "Refund fee", isPayoutFee: false };
  if (has(t, "AUTHORIZATION", "UNCAPTURED", "VOID")) return { key: "AUTHORIZATION", label: "Uncaptured authorization fee", isPayoutFee: false };
  if (has(t, "FAILED")) return { key: "FAILED", label: "Failed payment fee", isPayoutFee: false };
  if (has(t, "SUPPLEMENTAL")) return { key: "SUPPLEMENTAL", label: "Supplemental fee", isPayoutFee: false };
  if (has(t, "SUBSCRIPTION", "RECURRING")) return { key: "SUBSCRIPTION", label: "Subscription fee (per successful payment)", isPayoutFee: false };
  if (has(t, "ACH")) return { key: "ACH_PROCESSING", label: "ACH processing fee", isPayoutFee: false };
  if (has(t, "CARD")) return { key: "CARD_PROCESSING", label: "Card processing fee", isPayoutFee: false };

  return { key: "OTHER:" + t, label: readable(raw), isPayoutFee: false };
}

/**
 * Sums raw fee rows into one line per kind of charge, biggest first. A line that rounds to nothing is dropped, so
 * a fee type only appears once it has actually applied.
 */
export function groupFeesByType(rows: { feeType: string | null; count: number; amount: number }[]): FeeTypeRow[] {
  const groups = new Map<string, { label: string; count: number; amount: number; isPayoutFee: boolean }>();
  for (const row of rows) {
    const c = classifyFeeType(row.feeType);
    const g = groups.get(c.key) ?? { label: c.label, count: 0, amount: 0, isPayoutFee: c.isPayoutFee };
    g.count += row.count;
    g.amount += row.amount;
    groups.set(c.key, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => ({ key, label: g.label, count: g.count, amountCents: Math.round(g.amount), isPayoutFee: g.isPayoutFee }))
    .filter((g) => g.amountCents !== 0)
    .sort((a, b) => b.amountCents - a.amountCents || a.label.localeCompare(b.label));
}
