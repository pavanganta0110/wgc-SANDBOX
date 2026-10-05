import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 };

/**
 * Global-admin-only. Lists SystemIncident rows — the automatically-detected,
 * fingerprint-deduplicated incidents from incidentEngine.ts. Optional query
 * params: status, severity, service. Defaults to every status (including
 * resolved/ignored) so this list can also serve as incident history, not
 * just "what's currently on fire" (that's the Overview page's job).
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const severity = searchParams.get("severity") || undefined;
  const service = searchParams.get("service") || undefined;

  const where: Prisma.SystemIncidentWhereInput = {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
    ...(service ? { service } : {}),
  };

  const incidents = await prisma.systemIncident.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 200 });

  const incidentIds = incidents.map((i) => i.id);
  const sentAlertChannels = incidentIds.length
    ? await prisma.systemAlert.groupBy({ by: ["incidentId", "channel"], where: { incidentId: { in: incidentIds }, deliveryStatus: "SENT" } })
    : [];
  const channelsByIncident = new Map<string, Set<string>>();
  for (const row of sentAlertChannels) {
    if (!channelsByIncident.has(row.incidentId)) channelsByIncident.set(row.incidentId, new Set());
    channelsByIncident.get(row.incidentId)!.add(row.channel);
  }

  const rows = incidents
    .map((i) => ({
      id: i.id,
      title: i.title,
      service: i.service,
      severity: i.severity,
      status: i.status,
      startedAt: i.startedAt,
      lastSeenAt: i.lastSeenAt,
      resolvedAt: i.resolvedAt,
      occurrenceCount: i.occurrenceCount,
      affectedMerchantCount: i.affectedMerchantCount,
      affectedUserCount: i.affectedUserCount,
      notifiedChannels: Array.from(channelsByIncident.get(i.id) ?? []),
    }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 4) - (SEVERITY_RANK[b.severity] ?? 4) || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());

  return NextResponse.json({ incidents: rows });
}
