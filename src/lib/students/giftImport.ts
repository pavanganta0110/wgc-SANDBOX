/**
 * Student gifts import (server side): validates a gifts CSV against the
 * organization's roster, previews it with no writes, and on commit records
 * each gift as an offline ExternalDonation credited to the student. Safe to
 * run twice — every row carries a fingerprint and already-imported rows are
 * skipped — and every donor goes through the same resolveOrCreateDonor rule
 * as manual entry (match on email/phone, never on name alone).
 */
import { prisma } from "@/lib/prisma";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { resolveOrCreateDonorWithMatchReview } from "@/lib/donors/resolveOrCreateDonorWithMatchReview";
import { classifySource } from "@/lib/donations/externalDonationTypes";
import { parseStudentGiftImport } from "./giftImportPlan";

export interface GiftImportResult {
  kind: "gifts";
  committed: boolean;
  summary: {
    totalRows: number;
    validRows: number;
    errorRows: number;
    giftsToCreate: number;
    alreadyImported: number;
    totalCents: number;
  };
  errors: { rowNumber: number; studentNumber: string; errors: string[] }[];
  fatalError?: string;
}

export async function runStudentGiftImport(params: {
  auth: MerchantAuthContext;
  req: Request;
  csv: string;
  defaultTerm: string | null;
  commit: boolean;
  /** Student IDs from roster files in the same batch that aren't saved yet. */
  alsoKnown: string[];
}): Promise<GiftImportResult> {
  const { auth, req, csv, commit } = params;
  const { churchId } = auth;

  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { studentCurrentTerm: true } });
  const parsed = parseStudentGiftImport(csv, params.defaultTerm || church?.studentCurrentTerm || null);
  const empty = { totalRows: 0, validRows: 0, errorRows: 0, giftsToCreate: 0, alreadyImported: 0, totalCents: 0 };
  if (parsed.fatalError) return { kind: "gifts", committed: false, summary: empty, errors: [], fatalError: parsed.fatalError };

  const numbers = [...new Set(parsed.rows.map((r) => r.studentNumber).filter(Boolean))];
  const students = await prisma.student.findMany({
    where: { churchId, studentNumber: { in: numbers } },
    select: { id: true, studentNumber: true, firstName: true, lastName: true, email: true, isActive: true },
  });
  const byNumber = new Map(students.map((s) => [s.studentNumber, s]));
  const alsoKnown = new Set(params.alsoKnown);

  for (const row of parsed.rows) {
    if (row.studentNumber && !byNumber.has(row.studentNumber) && !alsoKnown.has(row.studentNumber)) {
      row.errors.push("Unknown Student ID (import the roster first)");
    }
    const s = byNumber.get(row.studentNumber);
    if (s && !s.isActive) row.errors.push("Student is inactive");
  }

  const valid = parsed.rows.filter((r) => r.errors.length === 0);
  const existing = valid.length
    ? await prisma.externalDonation.findMany({
        where: { churchId, importFingerprint: { in: valid.map((r) => r.fingerprint) } },
        select: { importFingerprint: true },
      })
    : [];
  const already = new Set(existing.map((e) => e.importFingerprint));
  const toCreate = valid.filter((r) => !already.has(r.fingerprint));

  const summary = {
    totalRows: parsed.rows.length,
    validRows: valid.length,
    errorRows: parsed.rows.length - valid.length,
    giftsToCreate: toCreate.length,
    alreadyImported: valid.length - toCreate.length,
    totalCents: toCreate.reduce((t, r) => t + (r.amountCents ?? 0), 0),
  };
  const errors = parsed.rows
    .filter((r) => r.errors.length > 0)
    .slice(0, 100)
    .map((r) => ({ rowNumber: r.rowNumber, studentNumber: r.studentNumber, errors: r.errors }));
  if (!commit) return { kind: "gifts", committed: false, summary, errors };

  let created = 0;
  for (const row of toCreate) {
    const student = byNumber.get(row.studentNumber);
    if (!student || row.amountCents == null || !row.date || !row.termLabel) continue;
    try {
      // Who gave: the named donor; for a self-paid gift with no donor, the
      // student themselves; otherwise an anonymous sponsor.
      const donorName = row.donorName ?? (row.givenFor === "SELF" ? `${student.firstName} ${student.lastName}`.trim() : null);
      const donorEmail = row.donorEmail ?? (row.givenFor === "SELF" && !row.donorName ? student.email : null);
      let donorId: string | null = null;
      let isAnonymous = false;
      if (donorName || donorEmail) {
        const resolved = await resolveOrCreateDonorWithMatchReview({
          churchId,
          name: donorName ?? undefined,
          email: donorEmail ?? undefined,
          sourceType: "EXTERNAL_DONATION_IMPORT",
          donationAmountCents: row.amountCents,
          donationDate: row.date,
          actorUserId: auth.userId,
          actorEmail: auth.email,
          actorRole: auth.role,
          req,
        });
        donorId = resolved.id;
      } else {
        isAnonymous = true;
      }

      await prisma.externalDonation.create({
        data: {
          churchId,
          donorId,
          donorMatchStatus: isAnonymous ? "ANONYMOUS" : "MATCHED",
          isAnonymous,
          donationAmountCents: row.amountCents,
          donationDate: row.date,
          paymentMethod: row.method,
          otherPaymentMethodName: row.method === "OTHER" ? "Imported" : null,
          source: classifySource(row.method),
          externalTransactionId: row.reference,
          internalNote: "Imported from Student Giving CSV",
          includeInAnnualStatement: true,
          status: "RECEIVED",
          processedByWgc: false,
          processingFeeCents: 0,
          supplementalFeeCents: 0,
          createdByUserId: auth.userId,
          importFingerprint: row.fingerprint,
          studentId: student.id,
          studentTermLabel: row.termLabel,
          studentGivenFor: row.givenFor,
        },
      });
      created++;
    } catch (err) {
      console.error("Student gift import row failed", { rowNumber: row.rowNumber, err });
      errors.push({ rowNumber: row.rowNumber, studentNumber: row.studentNumber, errors: ["Could not save this gift"] });
    }
  }
  return {
    kind: "gifts",
    committed: true,
    summary: { ...summary, giftsToCreate: created, errorRows: summary.errorRows + (toCreate.length - created) },
    errors,
  };
}
