/**
 * Student Giving ledger. Nothing here stores money: "credited" is always
 * recomputed from settled Payment / ExternalDonation rows, netted for
 * refunds and bank returns, so a reversed gift lowers a student's credit
 * automatically. Pending (e.g. ACH in flight) is reported separately and
 * never counted as credited.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeStudentStatus, studentDisplayName, type StudentCreditStatus } from "./constants";

export interface StudentGiftLine {
  key: string;
  source: "ONLINE" | "OFFLINE";
  id: string;
  studentId: string | null;
  termLabel: string | null;
  givenFor: string | null;
  date: Date;
  donorId: string | null;
  donorLabel: string;
  method: string;
  grossCents: number;
  /** Gross minus refunds / bank returns (never below zero). */
  netCents: number;
  settled: boolean;
}

export interface StudentLedgerRow {
  studentId: string;
  studentNumber: string;
  name: string;
  email: string | null;
  isActive: boolean;
  chargeCents: number | null;
  creditedCents: number;
  pendingCents: number;
  /** Charge minus credited; null when no charge is set for the term. */
  balanceCents: number | null;
  status: StudentCreditStatus;
  giftCount: number;
}

async function donorLabels(churchId: string, donorIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(donorIds)];
  if (ids.length === 0) return new Map();
  const donors = await prisma.donor.findMany({
    where: { churchId, id: { in: ids } },
    select: { id: true, name: true, email: true },
  });
  return new Map(donors.map((d) => [d.id, d.name || d.email || "Donor"]));
}

/** Loads every student-tagged gift matching the filters, with refund netting. */
async function loadGiftLines(params: {
  churchId: string;
  payment: Prisma.PaymentWhereInput;
  external: Prisma.ExternalDonationWhereInput;
}): Promise<StudentGiftLine[]> {
  const { churchId } = params;
  const [payments, externals] = await Promise.all([
    prisma.payment.findMany({
      where: { churchId, status: { in: ["SUCCEEDED", "PENDING"] }, ...params.payment },
      select: {
        id: true, studentId: true, studentTermLabel: true, studentGivenFor: true, createdAt: true, donorId: true,
        isAnonymous: true, paymentMethodType: true, amountCents: true, donationAmountCents: true, status: true,
        finixTransferId: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.externalDonation.findMany({
      where: { churchId, status: { not: "VOIDED" }, ...params.external },
      select: {
        id: true, studentId: true, studentTermLabel: true, studentGivenFor: true, donationDate: true, donorId: true,
        isAnonymous: true, paymentMethod: true, donationAmountCents: true, depositStatus: true,
      },
      orderBy: { donationDate: "desc" },
    }),
  ]);

  const transferIds = payments.map((p) => p.finixTransferId).filter((x): x is string => !!x);
  const [refunds, returns, labels] = await Promise.all([
    transferIds.length
      ? prisma.finixRefundOrReversal.findMany({
          where: { churchId, finixOriginalTransferId: { in: transferIds }, state: "SUCCEEDED" },
          select: { finixOriginalTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    transferIds.length
      ? prisma.bankReturn.findMany({
          where: { churchId, originalTransferId: { in: transferIds } },
          select: { originalTransferId: true, amountCents: true },
        })
      : Promise.resolve([]),
    donorLabels(
      churchId,
      [...payments.map((p) => p.donorId), ...externals.map((e) => e.donorId)].filter((x): x is string => !!x),
    ),
  ]);

  const removedByTransfer = new Map<string, number>();
  for (const r of refunds) {
    if (!r.finixOriginalTransferId) continue;
    removedByTransfer.set(r.finixOriginalTransferId, (removedByTransfer.get(r.finixOriginalTransferId) ?? 0) + (r.amountCents ?? 0));
  }
  for (const r of returns) {
    if (!r.originalTransferId) continue;
    removedByTransfer.set(r.originalTransferId, (removedByTransfer.get(r.originalTransferId) ?? 0) + (r.amountCents ?? 0));
  }

  const lines: StudentGiftLine[] = [];
  for (const p of payments) {
    const gross = p.donationAmountCents ?? p.amountCents;
    const removed = p.finixTransferId ? (removedByTransfer.get(p.finixTransferId) ?? 0) : 0;
    const net = removed >= p.amountCents ? 0 : Math.max(0, gross - removed);
    lines.push({
      key: `p:${p.id}`,
      source: "ONLINE",
      id: p.id,
      studentId: p.studentId,
      termLabel: p.studentTermLabel,
      givenFor: p.studentGivenFor,
      date: p.createdAt,
      donorId: p.donorId,
      donorLabel: p.isAnonymous ? "Anonymous" : (p.donorId && labels.get(p.donorId)) || "Donor",
      method: p.paymentMethodType,
      grossCents: gross,
      netCents: net,
      settled: p.status === "SUCCEEDED",
    });
  }
  for (const e of externals) {
    if (e.depositStatus === "RETURNED") continue;
    lines.push({
      key: `e:${e.id}`,
      source: "OFFLINE",
      id: e.id,
      studentId: e.studentId,
      termLabel: e.studentTermLabel,
      givenFor: e.studentGivenFor,
      date: e.donationDate,
      donorId: e.donorId,
      donorLabel: e.isAnonymous ? "Anonymous" : (e.donorId && labels.get(e.donorId)) || "Donor",
      method: e.paymentMethod,
      grossCents: e.donationAmountCents,
      netCents: e.donationAmountCents,
      settled: true,
    });
  }
  return lines.sort((a, b) => b.date.getTime() - a.date.getTime());
}

/** All students with their charge, credited, pending and balance for a term. */
export async function loadTermLedger(params: { churchId: string; termLabel: string | null }): Promise<StudentLedgerRow[]> {
  const { churchId, termLabel } = params;
  const [students, charges, lines] = await Promise.all([
    prisma.student.findMany({ where: { churchId }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    termLabel ? prisma.studentTermCharge.findMany({ where: { churchId, termLabel } }) : Promise.resolve([]),
    termLabel
      ? loadGiftLines({
          churchId,
          payment: { studentId: { not: null }, studentTermLabel: termLabel },
          external: { studentId: { not: null }, studentTermLabel: termLabel },
        })
      : Promise.resolve([] as StudentGiftLine[]),
  ]);

  const chargeByStudent = new Map(charges.map((c) => [c.studentId, c.amountCents]));
  const byStudent = new Map<string, { credited: number; pending: number; count: number }>();
  for (const l of lines) {
    if (!l.studentId) continue;
    const acc = byStudent.get(l.studentId) ?? { credited: 0, pending: 0, count: 0 };
    if (l.settled) acc.credited += l.netCents;
    else acc.pending += l.netCents;
    acc.count += 1;
    byStudent.set(l.studentId, acc);
  }

  return students.map((s) => {
    const agg = byStudent.get(s.id) ?? { credited: 0, pending: 0, count: 0 };
    const charge = chargeByStudent.has(s.id) ? (chargeByStudent.get(s.id) as number) : null;
    return {
      studentId: s.id,
      studentNumber: s.studentNumber,
      name: studentDisplayName(s),
      email: s.email,
      isActive: s.isActive,
      chargeCents: charge,
      creditedCents: agg.credited,
      pendingCents: agg.pending,
      balanceCents: charge == null ? null : charge - agg.credited,
      status: computeStudentStatus(charge, agg.credited),
      giftCount: agg.count,
    };
  });
}

/** Every student-tagged gift for a term (all students). */
export async function loadTermGiftLines(churchId: string, termLabel: string): Promise<StudentGiftLine[]> {
  return loadGiftLines({
    churchId,
    payment: { studentId: { not: null }, studentTermLabel: termLabel },
    external: { studentId: { not: null }, studentTermLabel: termLabel },
  });
}

/** Every gift credited to one student (all terms, or one term). */
export async function loadStudentGifts(params: { churchId: string; studentId: string; termLabel?: string | null }): Promise<StudentGiftLine[]> {
  const term = params.termLabel ? { studentTermLabel: params.termLabel } : {};
  return loadGiftLines({
    churchId: params.churchId,
    payment: { studentId: params.studentId, ...term },
    external: { studentId: params.studentId, ...term },
  });
}

/** Gifts to the general scholarship fund that no student has been assigned yet. */
export async function loadUnallocatedGifts(churchId: string): Promise<StudentGiftLine[]> {
  return loadGiftLines({
    churchId,
    payment: { studentId: null, studentGivenFor: "GENERAL" },
    external: { studentId: null, studentGivenFor: "GENERAL" },
  });
}

/** Distinct students (with term and total) a donor has supported. */
export async function loadStudentsSupportedByDonor(params: { churchId: string; donorId: string }) {
  const lines = await loadGiftLines({
    churchId: params.churchId,
    payment: { donorId: params.donorId, studentId: { not: null } },
    external: { donorId: params.donorId, studentId: { not: null } },
  });
  const ids = [...new Set(lines.map((l) => l.studentId).filter((x): x is string => !!x))];
  const students = ids.length
    ? await prisma.student.findMany({ where: { churchId: params.churchId, id: { in: ids } } })
    : [];
  const nameById = new Map(students.map((s) => [s.id, studentDisplayName(s)]));
  const grouped = new Map<string, { studentId: string; studentName: string; termLabel: string; totalCents: number; giftCount: number }>();
  for (const l of lines) {
    if (!l.studentId || !l.settled) continue;
    const key = `${l.studentId}|${l.termLabel ?? ""}`;
    const g = grouped.get(key) ?? {
      studentId: l.studentId,
      studentName: nameById.get(l.studentId) ?? "Student",
      termLabel: l.termLabel ?? "",
      totalCents: 0,
      giftCount: 0,
    };
    g.totalCents += l.netCents;
    g.giftCount += 1;
    grouped.set(key, g);
  }
  return [...grouped.values()].sort((a, b) => b.totalCents - a.totalCents);
}

/** Distinct term labels that have a charge or a tagged gift, newest charge first. */
export async function loadKnownTerms(churchId: string): Promise<string[]> {
  const [charges, church] = await Promise.all([
    prisma.studentTermCharge.findMany({ where: { churchId }, distinct: ["termLabel"], select: { termLabel: true }, orderBy: { updatedAt: "desc" } }),
    prisma.church.findUnique({ where: { id: churchId }, select: { studentCurrentTerm: true } }),
  ]);
  const terms = new Set<string>();
  if (church?.studentCurrentTerm) terms.add(church.studentCurrentTerm);
  for (const c of charges) terms.add(c.termLabel);
  return [...terms];
}
