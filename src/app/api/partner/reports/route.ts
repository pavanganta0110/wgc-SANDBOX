import { NextResponse } from "next/server";
import { csvResponse } from "@/lib/csvExport";
import { isAuthError } from "@/lib/auth/errors";
import { getPartnerSession } from "@/lib/partners/partnerSession";
import { parseVolumePeriod } from "@/lib/partners/loadPartnerVolume";
import { loadCommission } from "@/lib/partners/loadCommission";
import { agentsCsv, clientsCsv, commissionByOrganizationCsv, commissionCsv, loadClientReport, summarizeAgents } from "@/lib/partners/partnerReportsCsv";

export const dynamic = "force-dynamic";

/**
 * CSV downloads for a referral partner. `type` is clients (one row per client with its agent), agents (one row per
 * agent) commission (month by agent) or commission-organizations (each organization's commission, newest month). `period` is 2026-10 or all; anything else is the current month.
 * Who may download follows the pages the data comes from: Volume (partner staff incl. view-only, and agents for
 * their own clients) and Commission (partner staff and agents; not view-only). The partner and agent come from the
 * session only, so an agent can never download another agent's clients.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");
    if (type !== "clients" && type !== "agents" && type !== "commission" && type !== "commission-organizations") {
      return NextResponse.json({ error: "type must be clients, agents, commission or commission-organizations." }, { status: 400 });
    }

    const session = await getPartnerSession({ allowAgent: true, allowViewer: !type.startsWith("commission") });
    if (!session) return NextResponse.json({ error: "Partner sign-in required." }, { status: 401 });
    if (session.partnerType !== "REFERRAL") return NextResponse.json({ error: "Reports are for referral partners." }, { status: 403 });

    const p = parseVolumePeriod(searchParams.get("period") ?? undefined);
    let csv: string;
    if (type === "commission" || type === "commission-organizations") {
      const view = await loadCommission(session.partnerId, session.agentId ? { kind: "agent", agentId: session.agentId } : { kind: "partner" });
      if (!view) return NextResponse.json({ error: "Not found." }, { status: 404 });
      csv = type === "commission" ? commissionCsv(view) : commissionByOrganizationCsv(view);
    } else {
      const rows = await loadClientReport({ partnerId: session.partnerId, agentId: session.agentId, from: p.from, to: p.to });
      csv = type === "clients" ? clientsCsv(rows, p.from, p.to) : agentsCsv(summarizeAgents(rows, p.from, p.to));
    }
    return csvResponse(csv, `${type}_${p.key}.csv`);
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
