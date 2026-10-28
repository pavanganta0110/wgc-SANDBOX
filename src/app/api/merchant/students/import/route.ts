import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardStudentApi } from "@/lib/students/access";
import { parseStudentImport } from "@/lib/students/importPlan";
import { detectStudentImportKind } from "@/lib/students/giftImportPlan";
import { runStudentGiftImport } from "@/lib/students/giftImport";

/**
 * Roster (+ optional term charge) CSV import. `commit: false` returns a
 * preview with per-row errors and created/updated counts and writes nothing;
 * `commit: true` writes only the valid rows. Students match on Student ID
 * within the session's church, so re-importing updates instead of duplicating.
 */
export async function POST(req: Request) {
  const guard = await guardStudentApi({ manage: true });
  if (!guard.ok) return guard.response;
  const { churchId } = guard.auth;

  const body = await req.json().catch(() => ({}));
  if (typeof body.csv !== "string" || !body.csv.trim()) {
    return NextResponse.json({ error: "A CSV file is required" }, { status: 400 });
  }
  // One endpoint for every file: gifts files (donor/date columns) go to the
  // gifts importer, everything else is a roster (+ optional charges).
  if (detectStudentImportKind(body.csv) === "gifts") {
    const result = await runStudentGiftImport({
      auth: guard.auth,
      req,
      csv: body.csv,
      defaultTerm: typeof body.defaultTerm === "string" ? body.defaultTerm : null,
      commit: body.commit === true,
      alsoKnown: Array.isArray(body.alsoKnown) ? body.alsoKnown.filter((x: unknown): x is string => typeof x === "string").slice(0, 10000) : [],
    });
    if (result.fatalError) return NextResponse.json({ error: result.fatalError }, { status: 400 });
    return NextResponse.json(result);
  }
  const parsed = parseStudentImport(body.csv, typeof body.defaultTerm === "string" ? body.defaultTerm : null);
  if (parsed.fatalError) return NextResponse.json({ error: parsed.fatalError }, { status: 400 });

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  const existing = await prisma.student.findMany({
    where: { churchId, studentNumber: { in: valid.map((r) => r.studentNumber) } },
    select: { id: true, studentNumber: true },
  });
  const existingByNumber = new Map(existing.map((s) => [s.studentNumber, s.id]));
  const newNumbers = new Set(valid.filter((r) => !existingByNumber.has(r.studentNumber)).map((r) => r.studentNumber));

  const summary = {
    totalRows: parsed.rows.length,
    validRows: valid.length,
    errorRows: parsed.rows.length - valid.length,
    studentsToCreate: newNumbers.size,
    studentsToUpdate: new Set(valid.filter((r) => existingByNumber.has(r.studentNumber)).map((r) => r.studentNumber)).size,
    chargesToSet: valid.filter((r) => r.chargeCents != null).length,
  };
  const errors = parsed.rows.filter((r) => r.errors.length > 0).slice(0, 100).map((r) => ({ rowNumber: r.rowNumber, studentNumber: r.studentNumber, errors: r.errors }));

  const studentNumbers = valid.map((r) => r.studentNumber);
  if (body.commit !== true) return NextResponse.json({ kind: "roster", committed: false, summary, errors, studentNumbers });

  // Upsert students first (one id per student number), then charges.
  const idByNumber = new Map(existingByNumber);
  for (const row of valid) {
    const saved = await prisma.student.upsert({
      where: { churchId_studentNumber: { churchId, studentNumber: row.studentNumber } },
      create: { churchId, studentNumber: row.studentNumber, firstName: row.firstName, lastName: row.lastName, email: row.email },
      update: { firstName: row.firstName, lastName: row.lastName, ...(row.email ? { email: row.email } : {}) },
      select: { id: true },
    });
    idByNumber.set(row.studentNumber, saved.id);
    if (row.chargeCents != null && row.termLabel) {
      await prisma.studentTermCharge.upsert({
        where: { studentId_termLabel: { studentId: saved.id, termLabel: row.termLabel } },
        create: { churchId, studentId: saved.id, termLabel: row.termLabel, amountCents: row.chargeCents, source: "CSV_IMPORT" },
        update: { amountCents: row.chargeCents, source: "CSV_IMPORT" },
      });
    }
  }
  return NextResponse.json({ kind: "roster", committed: true, summary, errors, studentNumbers });
}
