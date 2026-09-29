/**
 * Builds operationally-useful, human-readable alert text from an
 * incident's current state — never a raw stack trace, never sensitive
 * customer/payment data (an incident row itself never carries any; see
 * healthEvents.ts's redaction).
 */

export interface IncidentAlertData {
  title: string;
  service: string;
  severity: string;
  status: string;
  occurrenceCount: number;
  affectedMerchantCount: number;
  startedAt: Date;
  lastSeenAt: Date;
  resolvedAt?: Date | null;
}

function fmtTime(d: Date): string {
  return d.toLocaleString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function fmtDuration(startMs: number, endMs: number): string {
  const minutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return `${hours} hour${hours === 1 ? "" : "s"}${rem ? ` ${rem} min` : ""}`;
}

export function buildInitialOrEscalationSubject(incident: IncidentAlertData): string {
  return `${incident.severity} — ${incident.title}`;
}

export function buildInitialOrEscalationBody(incident: IncidentAlertData): string {
  return [
    `${incident.severity} — ${incident.title}`,
    "",
    `Service: ${incident.service}`,
    `Technical failures: ${incident.occurrenceCount}`,
    `Affected merchants: ${incident.affectedMerchantCount}`,
    `Started: ${fmtTime(incident.startedAt)}`,
    `Current status: ${incident.status}`,
    "",
    "Open WGC System Health for details.",
  ].join("\n");
}

export function buildRecoverySubject(incident: IncidentAlertData): string {
  return `RECOVERED — ${incident.service} Processing Normal`;
}

export function buildRecoveryBody(incident: IncidentAlertData): string {
  const resolvedAt = incident.resolvedAt ?? new Date();
  return [
    `RECOVERED — ${incident.service} Processing Normal`,
    "",
    `Incident duration: ${fmtDuration(incident.startedAt.getTime(), resolvedAt.getTime())}`,
    `Affected merchants: ${incident.affectedMerchantCount}`,
    `Technical failures: ${incident.occurrenceCount}`,
    `Resolved: ${fmtTime(resolvedAt)}`,
  ].join("\n");
}

/** A short, single-segment-friendly version for SMS (no header line, no trailing CTA — every character counts against the carrier segment limit). */
export function buildSmsBody(incident: IncidentAlertData, kind: "ALERT" | "RECOVERY"): string {
  if (kind === "RECOVERY") {
    const resolvedAt = incident.resolvedAt ?? new Date();
    return `RECOVERED: ${incident.service} normal. Duration ${fmtDuration(incident.startedAt.getTime(), resolvedAt.getTime())}, ${incident.affectedMerchantCount} merchant(s) affected.`;
  }
  return `${incident.severity}: ${incident.title}. ${incident.occurrenceCount} failures, ${incident.affectedMerchantCount} merchant(s) affected. Check WGC System Health.`;
}
