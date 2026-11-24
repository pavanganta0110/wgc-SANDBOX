import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logDashboardAction } from "@/lib/dashboardAudit";
import { parseCsv } from "@/lib/donors/csvImport";
import { RECURRING_ENTITY_TYPE, RECURRING_SOURCE_SYSTEM, parseScheduleCsv } from "@/lib/migrations/recurringImport";

/**
 * The merchant sends WGC their recurring-gift schedule (one row per gift, no card or bank numbers) from the
 * Migration Center. It is stored as a Continue to Give job with status SUBMITTED; WGC staff then pick it up in
 * the admin Migration tab ("Use this file"), which marks it SUBMISSION_USED. Nothing here talks to Finix.
 */

export const SUBMISSION_STATUS = "SUBMITTED";
export const SUBMISSION_USED_STATUS = "SUBMISSION_USED";
export const SUBMISSION_STATUSES = [SUBMISSION_STATUS, SUBMISSION_USED_STATUS] as const;

export const MAX_SUBMISSION_BYTES = 2 * 1024 * 1024;
export const MAX_OPEN_SUBMISSIONS = 20;

export class SubmissionError extends Error {}

// ---------------------------------------------------------------------------------------------------------------
// The card-number safety scan

/** Column names that mean card or bank numbers. A file with one of these is refused outright. */
const FORBIDDEN_HEADER =
  /^(card_?(number|no|num)|cc_?(number|num)|pan|primary_account_number|cvv2?|cvc2?|security_code|account_number|bank_account(_number)?|routing_number|aba(_number)?|iban)$/;

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Returns a message when the CSV appears to hold card or bank numbers, else null. It never echoes the value
 * it found, so a number that slipped through is not repeated into the response or any log.
 */
export function findCardData(csv: string): string | null {
  const table = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return null;
  const bad = table[0].map(normHeader).find((h) => FORBIDDEN_HEADER.test(h));
  if (bad) return `The file has a "${bad}" column. Card and bank numbers must never be sent to WGC. Remove that column and send the file again.`;
  for (let r = 1; r < table.length; r++) {
    for (const value of table[r]) {
      const v = value.trim();
      if (v.length < 13 || v.length > 23 || !/^[\d][\d -]*[\d]$/.test(v)) continue;
      const digits = v.replace(/[^\d]/g, "");
      if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
        return `Row ${r + 1} has a value that looks like a card number. Card and bank numbers must never be sent to WGC. Remove it and send the file again.`;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------------------
// Create / list / read

export interface SubmissionView {
  id: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  submittedByEmail: string | null;
  createdAt: Date;
  usedByJobId: string | null;
}

export async function createScheduleSubmission(params: { churchId: string; userId: string; email: string; fileName: string | null; csv: string; role?: string }): Promise<{ id: string; rowCount: number }> {
  const { csv } = params;
  if (!csv.trim()) throw new SubmissionError("The file is empty.");
  if (Buffer.byteLength(csv, "utf8") > MAX_SUBMISSION_BYTES) throw new SubmissionError("The file is larger than 2 MB. Split it into smaller files.");

  const cardProblem = findCardData(csv);
  if (cardProblem) throw new SubmissionError(cardProblem);

  const parsed = parseScheduleCsv(csv);
  if (parsed.errors.length > 0) throw new SubmissionError(parsed.errors.join(" "));
  if (parsed.truncated) throw new SubmissionError("The file has more than 5,000 rows. Split it into smaller files.");
  if (parsed.rows.length === 0) throw new SubmissionError("The file has no data rows.");

  const open = await prisma.migrationJob.count({ where: { churchId: params.churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: SUBMISSION_STATUS } });
  if (open >= MAX_OPEN_SUBMISSIONS) throw new SubmissionError("There are already several files waiting for WGC. Please wait for them to be picked up.");

  const job = await prisma.migrationJob.create({
    data: {
      churchId: params.churchId,
      sourceSystem: RECURRING_SOURCE_SYSTEM,
      status: SUBMISSION_STATUS,
      entityTypesJson: [RECURRING_ENTITY_TYPE],
      fileName: params.fileName,
      totalRecords: 0,
      createdByUserId: params.userId,
      sourceDataJson: { kind: "schedule_submission", scheduleCsv: csv, rowCount: parsed.rows.length, submittedByEmail: params.email } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  await logDashboardAction({
    churchId: params.churchId,
    actorUserId: params.userId,
    actorEmail: params.email,
    actorRole: params.role ?? "merchant",
    action: "migration.recurring_schedule_submitted",
    entityType: "migration_job",
    entityId: job.id,
    metadata: { rows: parsed.rows.length, fileName: params.fileName },
  });
  return { id: job.id, rowCount: parsed.rows.length };
}

export async function listScheduleSubmissions(churchId: string): Promise<SubmissionView[]> {
  const jobs = await prisma.migrationJob.findMany({
    where: { churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { in: [...SUBMISSION_STATUSES] } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, fileName: true, status: true, createdAt: true, sourceDataJson: true },
  });
  return jobs.map((j) => {
    const data = (j.sourceDataJson ?? {}) as { rowCount?: number; submittedByEmail?: string; usedByJobId?: string };
    return { id: j.id, fileName: j.fileName, status: j.status, rowCount: data.rowCount ?? 0, submittedByEmail: data.submittedByEmail ?? null, createdAt: j.createdAt, usedByJobId: data.usedByJobId ?? null };
  });
}

/** The CSV text of one submission, for staff. Scoped to the organization. */
export async function getScheduleSubmissionCsv(id: string, churchId: string): Promise<{ csv: string; fileName: string | null } | null> {
  const job = await prisma.migrationJob.findFirst({
    where: { id, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { in: [...SUBMISSION_STATUSES] } },
    select: { fileName: true, sourceDataJson: true },
  });
  const csv = (job?.sourceDataJson as { scheduleCsv?: string } | null)?.scheduleCsv;
  return job && typeof csv === "string" ? { csv, fileName: job.fileName } : null;
}

export async function markScheduleSubmissionUsed(id: string, churchId: string, importJobId: string): Promise<void> {
  const job = await prisma.migrationJob.findFirst({ where: { id, churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: SUBMISSION_STATUS }, select: { sourceDataJson: true } });
  if (!job) return;
  await prisma.migrationJob.update({
    where: { id },
    data: { status: SUBMISSION_USED_STATUS, sourceDataJson: { ...((job.sourceDataJson as object) ?? {}), usedByJobId: importJobId } as Prisma.InputJsonValue },
  });
}
