/**
 * The designation a recurring renewal Payment carries. The fund is snapshotted
 * on the FinixSubscription when the donor sets up the gift (see the donate
 * route), and every renewal charge built from that subscription must stamp the
 * same fund — otherwise each renewal lands on the general fund in reports,
 * statements and exports. Never re-read from the giving link or the fund list
 * here, so a later change to the link or fund name doesn't re-designate
 * charges on an existing commitment.
 */
export function renewalDesignationFromSubscription(sub: {
  fundId?: string | null;
  fundName?: string | null;
}): { fundId: string | null; fundName: string | null } {
  return { fundId: sub.fundId ?? null, fundName: sub.fundName ?? null };
}
