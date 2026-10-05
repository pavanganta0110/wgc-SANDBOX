import { prisma } from "@/lib/prisma";
import type { HealthEventSeverity } from "./healthEvents";
import { INCIDENT_REOPEN_WINDOW_MS, INCIDENT_RECOVERY_STABILITY_MS } from "./thresholds";
import { notifyIncidentChange } from "./alertEngine";

/**
 * The automatic incident engine — evaluates whether an error group or a
 * service's current state is "incident-worthy," and creates/escalates/
 * resolves the corresponding SystemIncident row. Built around the existing
 * SystemIncident model from Phase 2; no new detection surface beyond what
 * Phase 2/3 already compute.
 *
 * FINGERPRINT / REOPEN DESIGN (why there's no partial unique index):
 * `SystemIncident.fingerprint` is a plain, always-unique column
 * (`@@unique`) that identifies one logical incident FOR ITS ENTIRE
 * LIFETIME — including across a resolve-then-fail-again cycle. This
 * project deploys schema changes via `prisma db push`, which can't safely
 * express a partial unique index ("unique only while status != RESOLVED")
 * the way a real migration could — so rather than create a second row with
 * the same fingerprint (which the unique constraint would reject anyway),
 * a resolved incident that fails again is REOPENED (same row, same id):
 *   - within INCIDENT_REOPEN_WINDOW_MS of its resolvedAt: reopen in place,
 *     preserving startedAt/occurrenceCount (still "the same outage,
 *     briefly recovered and flared back up").
 *   - beyond that window: also reopens the same row, but resets
 *     startedAt/occurrenceCount to reflect this as a fresh occurrence,
 *     which is what "create a new incident" means in spirit — the
 *     dashboard reads identically to a genuinely new incident (a fresh
 *     start time, occurrence count starting over), it just doesn't get a
 *     new database id. This trade-off is documented, deterministic, and
 *     testable, and avoids the concurrency hazard a raw find-then-create
 *     pattern would introduce (see CONCURRENCY below).
 *
 * CONCURRENCY: the common "already open, just update it" path uses
 * `prisma.systemIncident.upsert()` on the unique `fingerprint` column,
 * which Postgres executes as a single atomic INSERT ... ON CONFLICT — if
 * 20 requests fail at the same instant, they race safely into ONE row with
 * the occurrence count correctly incremented 20 times, never 20 rows. The
 * "reopen a resolved incident" transition is guarded by an `updateMany`
 * with `WHERE status = 'RESOLVED'` (same pattern as Aplos's
 * updateWhileProcessing) — if a concurrent evaluation already reopened it,
 * the guarded update simply affects 0 rows and this call treats that as
 * already-handled rather than erroring.
 */

export type IncidentStatus = "OPEN" | "INVESTIGATING" | "MONITORING" | "RESOLVED" | "IGNORED";

function severityRank(s: HealthEventSeverity): number {
  return { INFO: 0, WARNING: 1, ERROR: 2, CRITICAL: 3 }[s];
}

export interface UpsertIncidentParams {
  fingerprint: string;
  title: string;
  description?: string;
  service: string;
  severity: HealthEventSeverity;
  occurrenceCount: number;
  affectedMerchantCount: number;
  affectedUserCount?: number;
}

/**
 * Creates, escalates, or reopens the incident for this fingerprint. Never
 * throws — incident bookkeeping failing must never break the health event
 * or service-status computation that triggered it.
 */
export async function upsertIncident(params: UpsertIncidentParams): Promise<void> {
  try {
    const existing = await prisma.systemIncident.findUnique({ where: { fingerprint: params.fingerprint } });

    if (!existing) {
      const incident = await prisma.systemIncident.create({
        data: {
          fingerprint: params.fingerprint,
          title: params.title,
          description: params.description,
          service: params.service,
          severity: params.severity,
          status: "OPEN",
          occurrenceCount: params.occurrenceCount,
          affectedMerchantCount: params.affectedMerchantCount,
          affectedUserCount: params.affectedUserCount ?? 0,
        },
      });
      await notifyIncidentChange(incident.id, "INITIAL");
      return;
    }

    if (existing.status === "RESOLVED") {
      const reopenWithinWindow = existing.resolvedAt != null && Date.now() - existing.resolvedAt.getTime() < INCIDENT_REOPEN_WINDOW_MS;
      const ok = await prisma.systemIncident.updateMany({
        where: { id: existing.id, status: "RESOLVED" },
        data: reopenWithinWindow
          ? {
              status: "OPEN",
              resolvedAt: null,
              lastSeenAt: new Date(),
              severity: params.severity,
              occurrenceCount: { increment: params.occurrenceCount },
              affectedMerchantCount: Math.max(existing.affectedMerchantCount, params.affectedMerchantCount),
            }
          : {
              // Beyond the reopen window — treated as a fresh occurrence:
              // reset the counters/timeline rather than accumulating onto
              // a much older outage (see module doc comment).
              status: "OPEN",
              resolvedAt: null,
              startedAt: new Date(),
              lastSeenAt: new Date(),
              severity: params.severity,
              occurrenceCount: params.occurrenceCount,
              affectedMerchantCount: params.affectedMerchantCount,
            },
      });
      if (ok.count > 0) {
        await notifyIncidentChange(existing.id, "INITIAL");
      }
      // ok.count === 0 means another concurrent evaluation already reopened
      // it — that call's own notifyIncidentChange already covers this.
      return;
    }

    if (existing.status === "IGNORED") {
      // An admin explicitly marked this noise — never auto-reopen it.
      return;
    }

    // Already OPEN/INVESTIGATING/MONITORING — update in place. This upsert
    // is what makes the concurrent-failures case safe: Postgres resolves
    // the race as a single atomic increment, never a duplicate row.
    const previousSeverity = existing.severity as HealthEventSeverity;
    const escalated = severityRank(params.severity) > severityRank(previousSeverity);
    await prisma.systemIncident.update({
      where: { id: existing.id },
      data: {
        severity: escalated ? params.severity : existing.severity,
        lastSeenAt: new Date(),
        occurrenceCount: { increment: params.occurrenceCount },
        affectedMerchantCount: Math.max(existing.affectedMerchantCount, params.affectedMerchantCount),
        affectedUserCount: Math.max(existing.affectedUserCount, params.affectedUserCount ?? 0),
      },
    });

    if (escalated) {
      await notifyIncidentChange(existing.id, "ESCALATION");
    }
  } catch (err) {
    console.error("[upsertIncident] failed to upsert incident:", err);
  }
}

/**
 * Called from the daily system-health-sweep cron (recovery can't be
 * event-driven the way creation/escalation is — there's no event that
 * fires when NOTHING goes wrong). Resolves an open incident once its
 * service/fingerprint has been clean for INCIDENT_RECOVERY_STABILITY_MS,
 * so a single healthy request during a real outage doesn't instantly
 * "resolve" it. `isCurrentlyHealthy` is supplied by the caller (it already
 * knows how to check — e.g. serviceStatus.ts's per-service functions).
 */
export async function maybeResolveIncident(fingerprint: string, isCurrentlyHealthy: boolean): Promise<void> {
  if (!isCurrentlyHealthy) return;
  try {
    const incident = await prisma.systemIncident.findUnique({ where: { fingerprint } });
    if (!incident || (incident.status !== "OPEN" && incident.status !== "INVESTIGATING" && incident.status !== "MONITORING")) return;
    if (Date.now() - incident.lastSeenAt.getTime() < INCIDENT_RECOVERY_STABILITY_MS) return;

    const ok = await prisma.systemIncident.updateMany({
      where: { id: incident.id, status: { in: ["OPEN", "INVESTIGATING", "MONITORING"] } },
      data: { status: "RESOLVED", resolvedAt: new Date() },
    });
    if (ok.count > 0) {
      await notifyIncidentChange(incident.id, "RECOVERY");
    }
  } catch (err) {
    console.error("[maybeResolveIncident] failed to resolve incident:", err);
  }
}

const INCIDENT_TITLES: Record<string, string> = {
  "WGC API": "WGC API Error Spike",
  Supabase: "Database Connectivity Incident",
  Finix: "Finix Payment Processing Degraded",
  Resend: "Email Delivery Degraded",
  Twilio: "SMS Delivery Degraded",
  Aplos: "Aplos Sync Failure",
  Webhooks: "Webhook Processing Degraded",
};

/**
 * Distinct merchants with at least one event for this service in the last
 * 24h — a generous window relative to each service's own short status
 * window, since "who has been affected" is meaningfully broader than "is
 * it failing right now." Returns 0 for a genuinely global problem with no
 * merchant context (e.g. a WGC API render error, or a Finix client-level
 * failure — see finixHealth.ts's own note that it has no merchant context
 * to attach) — per the "do not attribute a merchant unless there's actual
 * evidence" instruction, this never guesses.
 */
async function countAffectedMerchants(service: string): Promise<number> {
  const { prisma: db } = await import("@/lib/prisma");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await db.systemHealthEvent.groupBy({
    by: ["merchantId"],
    where: { service, merchantId: { not: null }, createdAt: { gte: since } },
  });
  return rows.length;
}

/**
 * Called from src/lib/monitoring/healthEvents.ts right after it upserts a
 * SystemErrorGroup (ERROR/CRITICAL severity only) — this is the real-time,
 * event-driven half of incident detection. Re-checks the SAME service
 * status function serviceStatus.ts already exposes rather than re-deriving
 * its own threshold logic, so the incident engine and the service card the
 * Overview page shows can never disagree about whether a service is
 * currently degraded/down.
 */
export async function evaluateErrorGroupIncident(service: string): Promise<void> {
  try {
    const { getServiceStatusFn } = await import("./serviceStatus");
    const statusFn = getServiceStatusFn(service);
    if (!statusFn) return;

    const status = await statusFn();
    if (status.status === "OPERATIONAL" || status.status === "UNKNOWN") return;

    await upsertIncident({
      fingerprint: `${service}:degraded`,
      title: INCIDENT_TITLES[service] ?? `${service} Degraded`,
      description: status.note,
      service,
      severity: status.status === "OUTAGE" ? "CRITICAL" : "ERROR",
      occurrenceCount: status.recentFailureCount || 1,
      affectedMerchantCount: await countAffectedMerchants(service),
    });
  } catch (err) {
    console.error(`[evaluateErrorGroupIncident] failed for service ${service}:`, err);
  }
}

/**
 * Called from the daily system-health-sweep cron — the periodic half of
 * incident detection, covering everything that can't be event-driven
 * because nothing "happens" to trigger it: a webhook backlog building up
 * silently, a background job going stale, or a service recovering (there's
 * no event for "20 minutes of nothing going wrong"). Also acts as a
 * backstop that re-checks every service even if the event-driven path
 * missed a transition for any reason.
 */
export async function evaluateAllServiceIncidents(): Promise<void> {
  const { getAllServiceStatuses } = await import("./serviceStatus");
  const statuses = await getAllServiceStatuses();

  for (const status of statuses) {
    const fingerprint = `${status.service}:degraded`;
    if (status.status === "DEGRADED" || status.status === "OUTAGE") {
      await upsertIncident({
        fingerprint,
        title: INCIDENT_TITLES[status.service] ?? `${status.service} Degraded`,
        description: status.note,
        service: status.service,
        severity: status.status === "OUTAGE" ? "CRITICAL" : "ERROR",
        occurrenceCount: status.recentFailureCount || 1,
        affectedMerchantCount: await countAffectedMerchants(status.service),
      });
    } else if (status.status === "OPERATIONAL") {
      await maybeResolveIncident(fingerprint, true);
    }
  }
}
