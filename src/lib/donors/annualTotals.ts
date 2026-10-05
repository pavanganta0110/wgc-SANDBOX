import { prisma } from "@/lib/prisma";
import { findEligibleDonorsForYear } from "@/lib/donors/yearEndStatements";
import { computeAddressStatus } from "@/lib/donors/donorAddress";

/**
 * The year's giving per donor, joined to the mailing address a statement
 * would be sent to — the dataset behind both the "year totals" CSV export
 * and the combined print run. Totals are the same recorded contribution
 * amounts the statements themselves use (findEligibleDonorsForYear), so a
 * spreadsheet row always agrees with that donor's PDF.
 */
export interface YearTotalRow {
  donorId: string;
  name: string;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  addressStatus: string;
  donationCount: number;
  totalCents: number;
}

export async function loadYearTotals(churchId: string, taxYear: number): Promise<YearTotalRow[]> {
  const eligible = await findEligibleDonorsForYear(churchId, taxYear);
  if (eligible.length === 0) return [];
  const byDonor = new Map(eligible.map((e) => [e.donorId, e]));
  const donors = await prisma.donor.findMany({ where: { churchId, id: { in: eligible.map((e) => e.donorId) } } });

  return donors
    .map((d) => {
      const e = byDonor.get(d.id)!;
      return {
        donorId: d.id,
        // A statement is the donor's own private record — "anonymous" only
        // hides their name publicly, never on what is mailed to them.
        name: d.name?.trim() || d.companyName?.trim() || "",
        email: d.email,
        addressLine1: d.addressLine1,
        addressLine2: d.addressLine2,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
        country: d.country,
        addressStatus: computeAddressStatus(d),
        donationCount: e.donationCount,
        totalCents: e.recordedTotalCents,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
