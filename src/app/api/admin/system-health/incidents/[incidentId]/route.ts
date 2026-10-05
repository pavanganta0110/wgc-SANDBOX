import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAdminSession } from "@/lib/auth/session";

interface TimelineEntry {
  at: Date;
  type: "CREATED" | "ALERT_SENT" | "RESOLVED";
  severity: string;
  detail: string;
}

const ALLOWED_MANUAL_STATUSES = ["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED", "IGNORED"];

/**
 * Global-admin-only. Full incident detail — timeline (built from the
 * incident's own lifecycle fields plus every alert actually sent, since
 * there's no separate severity-change-log table; an ESCALATION/RECOVERY
 * alert already records the severity it was sent at), related error groups
 * and their most recent health events, related jobs (when this is the
 * Background Jobs incident), affected merchants (real relationships only —
 * resolved the same way the error-group detail route does), Sentry links,
 * and every alert sent.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { incidentId } = await params;

  const incident = await prisma.systemIncident.findUnique({
    where: { id: incidentId },
    include: { errorGroups: { orderBy: { lastSeenAt: "desc" } }, alerts: { orderBy: { sentAt: "asc" } } },
  });
  if (!incident) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const errorGroupIds = incident.errorGroups.map((g) => g.id);

  const [recentEvents, merchantRows] = await Promise.all([
    prisma.systemHealthEvent.findMany({
      where: { OR: [{ service: incident.service }, ...(errorGroupIds.length ? [{ errorGroupId: { in: errorGroupIds } }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, operation: true, status: true, severity: true, merchantId: true, message: true, requestId: true, wgcReference: true },
    }),
    prisma.systemHealthEvent.groupBy({
      by: ["merchantId"],
      where: { service: incident.service, merchantId: { not: null }, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    }),
  ]);

  const merchantIds = merchantRows.map((r) => r.merchantId).filter((id): id is string => !!id);
  const affectedMerchants = merchantIds.length ? await prisma.church.findMany({ where: { id: { in: merchantIds } }, select: { id: true, name: true } }) : [];

  // "Related jobs" only makes sense for the Background Jobs incident — every
  // other service has no per-job breakdown. Distinct job names come from
  // the operation field failJobRun()/markJobPartialFailure() set.
  const relatedJobs =
    incident.service === "Background Jobs" ? Array.from(new Set(recentEvents.map((e) => e.operation).filter((op): op is string => !!op))) : [];

  const sentryIssueUrls = Array.from(new Set(incident.errorGroups.map((g) => g.sentryIssueUrl).filter((u): u is string => !!u)));

  const createdEntry: TimelineEntry = { at: incident.startedAt, type: "CREATED", severity: incident.severity, detail: `Incident opened: ${incident.title}` };
  const alertEntries: TimelineEntry[] = incident.alerts.map((a) => ({
    at: a.sentAt,
    type: "ALERT_SENT",
    severity: a.severity,
    detail: `${a.notificationType} alert via ${a.channel}${a.deliveryStatus === "FAILED" ? ` — delivery FAILED (${a.failureReason ?? "unknown reason"})` : ""}`,
  }));
  const resolvedEntry: TimelineEntry[] = incident.resolvedAt
    ? [{ at: incident.resolvedAt, type: "RESOLVED", severity: incident.severity, detail: "Incident resolved — service returned to a stable healthy state." }]
    : [];
  const timeline: TimelineEntry[] = [createdEntry, ...alertEntries, ...resolvedEntry].sort((a, b) => a.at.getTime() - b.at.getTime());

  return NextResponse.json({
    id: incident.id,
    fingerprint: incident.fingerprint,
    title: incident.title,
    description: incident.description,
    service: incident.service,
    severity: incident.severity,
    status: incident.status,
    startedAt: incident.startedAt,
    lastSeenAt: incident.lastSeenAt,
    resolvedAt: incident.resolvedAt,
    occurrenceCount: incident.occurrenceCount,
    affectedMerchantCount: incident.affectedMerchantCount,
    affectedUserCount: incident.affectedUserCount,
    sentryIssueUrl: incident.sentryIssueUrl,
    sentryIssueUrls,
    notes: incident.notes,
    timeline,
    errorGroups: incident.errorGroups.map((g) => ({ id: g.id, message: g.message, severity: g.severity, status: g.status, occurrenceCount: g.occurrenceCount, lastSeenAt: g.lastSeenAt })),
    relatedEvents: recentEvents,
    relatedJobs,
    affectedMerchants,
    alerts: incident.alerts,
  });
}

/**
 * Global-admin-only manual override — lets an admin move an incident to
 * INVESTIGATING/MONITORING while working it, mark it IGNORED (the one
 * status the automatic engine deliberately never sets on its own — see
 * upsertIncident()'s own comment), or manually RESOLVED/re-OPENED. Never
 * touches severity, occurrenceCount, or fingerprint — those stay
 * exclusively computed by the incident engine so a manual edit here can
 * never desync from what the automatic detection believes is true.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ incidentId: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { incidentId } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const data: { status?: string; resolvedAt?: Date | null; notes?: string } = {};

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !ALLOWED_MANUAL_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: `status must be one of ${ALLOWED_MANUAL_STATUSES.join(", ")}` }, { status: 400 });
    }
    data.status = body.status;
    data.resolvedAt = body.status === "RESOLVED" ? new Date() : null;
  }
  if (body.notes !== undefined) {
    if (typeof body.notes !== "string") return NextResponse.json({ error: "notes must be a string" }, { status: 400 });
    data.notes = body.notes;
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    const updated = await prisma.systemIncident.update({ where: { id: incidentId }, data });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
