import { prisma } from "@/lib/prisma";
import { formatPersonName } from "@/lib/formatPersonName";

/**
 * One row per payment inside a deposit (a deposit bundles settlements, which
 * bundle payments). Shared by the deposit detail page, the expandable list on
 * the deposits page and the per-payment CSV, so the three can never disagree.
 *
 * The per-row net is gross minus that payment's own fees, refunds and bank
 * returns — the same math the settlement detail page already uses. Anything
 * the deposit paid out that is not tied to one payment (for example the
 * per-settlement funding fee) is surfaced by `summarizeDepositRows` as an
 * explicit adjustment line so the rows always reconcile to the deposit.
 */
export type DepositPaymentRow = {
  transferId: string;
  paymentId: string | null;
  settlementId: string | null;
  createdAt: Date | null;
  payerName: string;
  payerEmail: string;
  studentNumber: string;
  studentName: string;
  term: string;
  fundName: string;
  note: string;
  method: string;
  lastFour: string;
  state: string;
  grossCents: number;
  feeCents: number;
  refundCents: number;
  returnCents: number;
  netCents: number;
};

export type DepositRowsSummary = {
  paymentCount: number;
  grossCents: number;
  feeCents: number;
  refundCents: number;
  returnCents: number;
  rowsNetCents: number;
  /** Deposit net minus the sum of the rows: settlement-level fees/adjustments not tied to a single payment. */
  otherAdjustmentsCents: number;
  depositNetCents: number;
};

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function summarizeDepositRows(rows: DepositPaymentRow[], depositNetCents: number): DepositRowsSummary {
  const rowsNetCents = sum(rows.map((r) => r.netCents));
  return {
    paymentCount: rows.length,
    grossCents: sum(rows.map((r) => r.grossCents)),
    feeCents: sum(rows.map((r) => r.feeCents)),
    refundCents: sum(rows.map((r) => r.refundCents)),
    returnCents: sum(rows.map((r) => r.returnCents)),
    rowsNetCents,
    otherAdjustmentsCents: depositNetCents - rowsNetCents,
    depositNetCents,
  };
}

/** Loads the per-payment rows for every payment in the given settlements, newest first. */
export async function loadDepositPaymentRows(churchId: string, finixSettlementIds: string[]): Promise<DepositPaymentRow[]> {
  if (finixSettlementIds.length === 0) return [];

  const transfers = await prisma.finixTransfer.findMany({
    where: { churchId, finixSettlementId: { in: finixSettlementIds } },
    orderBy: { createdAtFinix: "desc" },
  });
  if (transfers.length === 0) return [];
  const transferIds = transfers.map((t) => t.finixTransferId);

  const [payments, fees, refunds, bankReturns] = await Promise.all([
    prisma.payment.findMany({ where: { churchId, finixTransferId: { in: transferIds } } }),
    prisma.finixFee.findMany({ where: { churchId, linkedToId: { in: transferIds } } }),
    prisma.finixRefundOrReversal.findMany({ where: { churchId, finixOriginalTransferId: { in: transferIds } } }),
    prisma.bankReturn.findMany({ where: { churchId, originalTransferId: { in: transferIds } } }),
  ]);
  const paymentByTransfer = new Map(payments.map((p) => [p.finixTransferId as string, p]));

  const donorIds = [...new Set(payments.map((p) => p.donorId).filter((id): id is string => !!id))];
  const studentIds = [...new Set(payments.map((p) => p.studentId).filter((id): id is string => !!id))];
  const instrumentIds = [...new Set(transfers.map((t) => t.finixPaymentInstrumentId).filter((id): id is string => !!id))];
  const [donors, students, instruments] = await Promise.all([
    donorIds.length ? prisma.donor.findMany({ where: { churchId, id: { in: donorIds } } }) : Promise.resolve([]),
    studentIds.length ? prisma.student.findMany({ where: { churchId, id: { in: studentIds } } }) : Promise.resolve([]),
    instrumentIds.length
      ? prisma.finixPaymentInstrumentSnapshot.findMany({ where: { finixPaymentInstrumentId: { in: instrumentIds } } })
      : Promise.resolve([]),
  ]);
  const donorsById = new Map(donors.map((d) => [d.id, d]));
  const studentsById = new Map(students.map((s) => [s.id, s]));
  const instrumentsById = new Map(instruments.map((i) => [i.finixPaymentInstrumentId, i]));

  const totalBy = <T,>(items: T[], key: (item: T) => string | null, amount: (item: T) => number | null) => {
    const totals = new Map<string, number>();
    for (const item of items) {
      const k = key(item);
      if (!k) continue;
      totals.set(k, (totals.get(k) ?? 0) + (amount(item) ?? 0));
    }
    return totals;
  };
  const feeTotals = totalBy(fees, (f) => f.linkedToId, (f) => f.amountCents);
  const refundTotals = totalBy(refunds, (r) => r.finixOriginalTransferId, (r) => r.amountCents);
  const returnTotals = totalBy(bankReturns, (b) => b.originalTransferId, (b) => b.amountCents);

  return transfers.map((transfer) => {
    const payment = paymentByTransfer.get(transfer.finixTransferId) ?? null;
    const donor = payment?.donorId ? donorsById.get(payment.donorId) ?? null : null;
    const student = payment?.studentId ? studentsById.get(payment.studentId) ?? null : null;
    const instrument = transfer.finixPaymentInstrumentId ? instrumentsById.get(transfer.finixPaymentInstrumentId) ?? null : null;

    const grossCents = payment?.amountCents ?? transfer.amountCents ?? 0;
    const feeCents = feeTotals.get(transfer.finixTransferId) ?? 0;
    const refundCents = refundTotals.get(transfer.finixTransferId) ?? 0;
    const returnCents = returnTotals.get(transfer.finixTransferId) ?? 0;

    return {
      transferId: transfer.finixTransferId,
      paymentId: payment?.id ?? null,
      settlementId: transfer.finixSettlementId,
      createdAt: payment?.createdAt ?? transfer.createdAtFinix,
      payerName: formatPersonName(donor?.name, instrument?.accountHolderName),
      payerEmail: donor?.email ?? "",
      studentNumber: student?.studentNumber ?? "",
      studentName: student ? `${student.firstName} ${student.lastName}`.trim() : "",
      term: payment?.studentTermLabel ?? "",
      fundName: payment?.fundName ?? "",
      note: payment?.note ?? "",
      method: instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account" : "—"),
      lastFour: instrument?.cardLast4 || instrument?.bankLast4 || "",
      state: transfer.state ?? payment?.status ?? "",
      grossCents,
      feeCents,
      refundCents,
      returnCents,
      netCents: grossCents - feeCents - refundCents - returnCents,
    };
  });
}
