import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { buildCsvExport, csvResponse } from "@/lib/csvExport";
import { filterLeads, LEAD_CSV_COLUMNS, toAdminRow } from "@/lib/scorecard/adminRows";
import { listContacts } from "@/lib/scorecard/store";

/** Every scorecard lead as a CSV (same search and status filter as the list). Formula-looking cells are neutralized. */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(req.url).searchParams;
    const rows = filterLeads((await listContacts()).map(toAdminRow), { q: q.get("q") ?? "", status: q.get("status") ?? "ALL", sort: q.get("sort") ?? "newest" });
    return csvResponse(buildCsvExport(rows, LEAD_CSV_COLUMNS), "scorecard_leads.csv");
  } catch (error) {
    console.error("Failed to export scorecard leads:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
