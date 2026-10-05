import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";
import type { Prisma } from "@prisma/client";

/**
 * Global-admin-only. Lists SystemErrorGroup rows (the WGC-owned equivalent
 * of a Sentry Issue — one row per distinct problem, not per occurrence),
 * with the affected-merchant/user counts computed live from the
 * SystemHealthEvent rows that belong to each group. Filters are all
 * optional query params: severity, service, integration, route, status,
 * merchantId, since (ISO date), until (ISO date).
 */
export async function GET(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const severity = searchParams.get("severity") || undefined;
  const service = searchParams.get("service") || undefined;
  const integration = searchParams.get("integration") || undefined;
  const route = searchParams.get("route") || undefined;
  const status = searchParams.get("status") || undefined;
  const merchantId = searchParams.get("merchantId") || undefined;
  const since = searchParams.get("since") || undefined;
  const until = searchParams.get("until") || undefined;

  const where: Prisma.SystemErrorGroupWhereInput = {
    ...(severity ? { severity } : {}),
    ...(service ? { service } : {}),
    ...(integration ? { integration } : {}),
    ...(route ? { route } : {}),
    ...(status ? { status } : {}),
    ...(since || until
      ? {
          lastSeenAt: {
            ...(since ? { gte: new Date(since) } : {}),
            ...(until ? { lte: new Date(until) } : {}),
          },
        }
      : {}),
    // Filtering by merchant means "this merchant was affected by the
    // group" — at least one of its events carries that merchantId. This is
    // also the merchant-isolation-relevant filter: it must never leak a
    // group where the ONLY events are for a different merchant.
    ...(merchantId ? { events: { some: { merchantId } } } : {}),
  };

  const groups = await prisma.systemErrorGroup.findMany({
    where,
    orderBy: { lastSeenAt: "desc" },
    take: 200,
  });

  const groupIds = groups.map((g) => g.id);
  const [affectedMerchants, affectedUsers, latestEvents] = await Promise.all([
    groupIds.length
      ? prisma.systemHealthEvent.groupBy({ by: ["errorGroupId", "merchantId"], where: { errorGroupId: { in: groupIds }, merchantId: { not: null } } })
      : Promise.resolve([]),
    groupIds.length
      ? prisma.systemHealthEvent.groupBy({ by: ["errorGroupId", "userId"], where: { errorGroupId: { in: groupIds }, userId: { not: null } } })
      : Promise.resolve([]),
    groupIds.length
      ? prisma.systemHealthEvent.findMany({
          where: { errorGroupId: { in: groupIds } },
          orderBy: { createdAt: "desc" },
          distinct: ["errorGroupId"],
          select: { errorGroupId: true, requestId: true },
        })
      : Promise.resolve([]),
  ]);

  const merchantCountByGroup = new Map<string, number>();
  for (const row of affectedMerchants) {
    if (!row.errorGroupId) continue;
    merchantCountByGroup.set(row.errorGroupId, (merchantCountByGroup.get(row.errorGroupId) ?? 0) + 1);
  }
  const userCountByGroup = new Map<string, number>();
  for (const row of affectedUsers) {
    if (!row.errorGroupId) continue;
    userCountByGroup.set(row.errorGroupId, (userCountByGroup.get(row.errorGroupId) ?? 0) + 1);
  }
  const latestRequestIdByGroup = new Map<string, string | null>();
  for (const row of latestEvents) {
    if (!row.errorGroupId) continue;
    latestRequestIdByGroup.set(row.errorGroupId, row.requestId);
  }

  return NextResponse.json({
    errorGroups: groups.map((g) => ({
      id: g.id,
      service: g.service,
      integration: g.integration,
      route: g.route,
      severity: g.severity,
      status: g.status,
      message: g.message,
      firstSeenAt: g.firstSeenAt,
      lastSeenAt: g.lastSeenAt,
      occurrenceCount: g.occurrenceCount,
      affectedMerchantCount: merchantCountByGroup.get(g.id) ?? 0,
      affectedUserCount: userCountByGroup.get(g.id) ?? 0,
      latestRequestId: latestRequestIdByGroup.get(g.id) ?? null,
      incidentId: g.incidentId,
    })),
  });
}
