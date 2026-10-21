/**
 * The processing fee actually charged to the organization for one payment,
 * as Finix recorded it.
 *
 * Finix never puts this on the transfer itself (FinixTransfer.feeCents is
 * always 0 for WGC's fee-profile pricing). It records it as separate Fee
 * objects marked PLATFORM_FEE, synced into FinixFee:
 *   - organization pays: CARD_FIXED + CARD_BASIS_POINTS (or the ACH ones)
 *   - donor covers it:   one SUPPLEMENTAL_FEE_FIXED
 * Amounts can carry fractions of a cent (e.g. 124.32), so the sum is rounded.
 *
 * Returns null when no PLATFORM_FEE rows have synced yet ("pending"), never
 * a guessed amount.
 */
export interface FeeRowLike {
  feeSubtype: string | null;
  feeCategory: string | null;
  amountCents: number | null;
}

export function isPlatformFee(row: Pick<FeeRowLike, "feeSubtype" | "feeCategory">): boolean {
  return row.feeSubtype === "PLATFORM_FEE" || row.feeCategory === "PLATFORM_FEE";
}

export function platformFeeCents(rows: FeeRowLike[]): number | null {
  const platform = rows.filter(isPlatformFee);
  if (platform.length === 0) return null;
  return Math.round(platform.reduce((sum, r) => sum + (r.amountCents ?? 0), 0));
}
