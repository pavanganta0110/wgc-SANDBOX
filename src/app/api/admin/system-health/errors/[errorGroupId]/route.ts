import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

/**
 * Global-admin-only. Full detail for one SystemErrorGroup, including its
 * most recent occurrences (for the "recent events" list) and live-computed
 * affected merchant/user counts. Deliberately never returns a stack trace —
 * per the architecture split, Sentry (Layer 1) owns deep technical
 * exception detail; this only ever links out to it via sentryIssueUrl when
 * one exists (never fabricated).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ errorGroupId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { errorGroupId } = await params;

  const group = await prisma.systemErrorGroup.findUnique({
    where: { id: errorGroupId },
    include: { incident: { select: { id: true, title: true, status: true, severity: true } } },
  });
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [recentEvents, merchantRows, userRows] = await Promise.all([
    prisma.systemHealthEvent.findMany({
      where: { errorGroupId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        createdAt: true,
        status: true,
        severity: true,
        merchantId: true,
        userId: true,
        requestId: true,
        externalId: true,
        wgcReference: true,
        release: true,
        message: true,
        metadata: true,
      },
    }),
    prisma.systemHealthEvent.groupBy({ by: ["merchantId"], where: { errorGroupId, merchantId: { not: null } } }),
    prisma.systemHealthEvent.groupBy({ by: ["userId"], where: { errorGroupId, userId: { not: null } } }),
  ]);

  // Merchant names are worth resolving for display — an admin shouldn't
  // have to go cross-reference a raw church id by hand. Never exposes
  // anything about a merchant beyond its name (no financial/PII fields).
  const merchantIds = merchantRows.map((r) => r.merchantId).filter((id): id is string => !!id);
  const merchants = merchantIds.length ? await prisma.church.findMany({ where: { id: { in: merchantIds } }, select: { id: true, name: true } }) : [];

  return NextResponse.json({
    id: group.id,
    service: group.service,
    integration: group.integration,
    route: group.route,
    severity: group.severity,
    status: group.status,
    message: group.message,
    firstSeenAt: group.firstSeenAt,
    lastSeenAt: group.lastSeenAt,
    occurrenceCount: group.occurrenceCount,
    sentryIssueUrl: group.sentryIssueUrl,
    notes: group.notes,
    incident: group.incident,
    affectedMerchants: merchants,
    affectedUserCount: userRows.length,
    recentEvents,
  });
}
