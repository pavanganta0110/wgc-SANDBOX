import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { filterLeads, toAdminRow } from "@/lib/scorecard/adminRows";
import { listContacts } from "@/lib/scorecard/store";

/** The fundraising scorecard's leads, for the admin list. Any signed-in WGC admin. */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(req.url).searchParams;
    const all = (await listContacts()).map(toAdminRow);
    const leads = filterLeads(all, { q: q.get("q") ?? "", status: q.get("status") ?? "ALL", sort: q.get("sort") ?? "newest" });
    return NextResponse.json({ leads, total: all.length });
  } catch (error) {
    console.error("Failed to load scorecard leads:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
