import { NextResponse } from "next/server";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { isAuthError } from "@/lib/auth/errors";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { buildCsvExport, csvResponse, type CsvColumn } from "@/lib/csvExport";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { loadYearTotals, buildYearTotalsWorkbook, type YearTotalRow } from "@/lib/donors/annualTotals";

const COLUMNS: CsvColumn<YearTotalRow>[] = [
  { header: "Donor Name", value: (r) => r.name },
  { header: "Address Line 1", value: (r) => r.addressLine1 || "" },
  { header: "Address Line 2", value: (r) => r.addressLine2 || "" },
  { header: "City", value: (r) => r.city || "" },
  { header: "State", value: (r) => r.state || "" },
  { header: "ZIP", value: (r) => r.postalCode || "" },
  { header: "Country", value: (r) => r.country || "" },
  { header: "Email", value: (r) => r.email || "" },
  { header: "Number of Gifts", value: (r) => String(r.donationCount) },
  { header: "Total Given", value: (r) => (r.totalCents / 100).toFixed(2) },
  { header: "Address Status", value: (r) => r.addressStatus },
];

/** GET ?year=YYYY[&mailableOnly=1][&format=xlsx] — CSV by default, a real Excel workbook with format=xlsx. One row per donor with a gift that year: name, mailing address, email, total. */
export async function GET(req: Request) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const permissions = getDonorPermissions(auth.impersonation ? "owner" : auth.rawRole);
  if (!permissions.canView || !permissions.canExport) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear() - 1), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "A valid year is required." }, { status: 400 });
  }
  const mailableOnly = searchParams.get("mailableOnly") === "1";

  let rows = await loadYearTotals(auth.churchId, year);
  if (mailableOnly) rows = rows.filter((r) => r.addressStatus !== "MISSING");

  await logDashboardAction({
    churchId: auth.churchId,
    actorUserId: auth.userId,
    actorEmail: auth.email,
    actorRole: auth.rawRole,
    action: "statement.year_totals_exported",
    entityType: "donor",
    metadata: { taxYear: year, rows: rows.length, mailableOnly, format: searchParams.get("format") === "xlsx" ? "xlsx" : "csv" },
    req,
  });

  if (searchParams.get("format") === "xlsx") {
    const buffer = await buildYearTotalsWorkbook(rows, year);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="donor-giving-totals-${year}.xlsx"`,
      },
    });
  }

  return csvResponse("\uFEFF" + buildCsvExport(rows, COLUMNS).replace(/\n/g, "\r\n"), `donor-giving-totals-${year}.csv`);
}
