import ExcelJS from "exceljs";
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

/**
 * A real .xlsx of the year's totals — the same columns as the CSV, but with
 * the total stored as a number (so it sums and sorts), ZIP codes kept as
 * text (leading zeros survive), a frozen header and sensible widths, ready
 * to mail-merge into the January letters. Cell text is written as plain
 * strings, never formulas, so donor-entered text can't run as one.
 */
export async function buildYearTotalsWorkbook(rows: YearTotalRow[], year: number): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "WGC Payments";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`${year} Giving`, { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Donor Name", key: "name", width: 28 },
    { header: "Address Line 1", key: "line1", width: 30 },
    { header: "Address Line 2", key: "line2", width: 16 },
    { header: "City", key: "city", width: 18 },
    { header: "State", key: "state", width: 7 },
    { header: "ZIP", key: "zip", width: 10, style: { numFmt: "@" } },
    { header: "Country", key: "country", width: 9 },
    { header: "Email", key: "email", width: 30 },
    { header: "Number of Gifts", key: "count", width: 14 },
    { header: "Total Given", key: "total", width: 14, style: { numFmt: "$#,##0.00" } },
    { header: "Address Status", key: "status", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  for (const r of rows) {
    sheet.addRow({
      name: r.name,
      line1: r.addressLine1 ?? "",
      line2: r.addressLine2 ?? "",
      city: r.city ?? "",
      state: r.state ?? "",
      zip: r.postalCode ?? "",
      country: r.country ?? "",
      email: r.email ?? "",
      count: r.donationCount,
      total: r.totalCents / 100,
      status: r.addressStatus,
    });
  }
  const totalRow = sheet.addRow({ name: "Total", count: rows.reduce((n, r) => n + r.donationCount, 0), total: rows.reduce((n, r) => n + r.totalCents, 0) / 100 });
  totalRow.font = { bold: true };
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
