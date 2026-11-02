import { buildCsvExport, type CsvColumn } from "@/lib/csvExport";
import { summarizeDepositRows, type DepositPaymentRow } from "@/lib/finix/depositPaymentRows";

/** Plain decimal dollars (no $ or thousands separators) so spreadsheets and SIS imports read it as a number. */
function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export type DepositCsvOptions = {
  depositId: string;
  depositNetCents: number;
  /** Add Student ID / Student Name columns (orgs with Student Giving). */
  showStudent: boolean;
  /** Add the Term column (orgs with Student Giving or the Take a Payment term field). */
  showTerm: boolean;
  /** "Payer" wording instead of "Donor" (payment mode). */
  paymentMode: boolean;
};

type Line = Record<string, string>;

const AMOUNT_HEADERS = new Set(["Gross", "Fees", "Refunds", "Bank Returns", "Net"]);

/**
 * The deposit's payments as CSV: one row per payment, then an "Other
 * settlement-level adjustments" row and a "Deposit total" row so the file
 * adds up to exactly what hit the bank. Amounts are signed: fees, refunds and
 * returns are negative, so every row's Net is the sum of its own columns.
 */
export function buildDepositPaymentsCsv(rows: DepositPaymentRow[], opts: DepositCsvOptions): string {
  const payer = opts.paymentMode ? "Payer" : "Donor";
  const summary = summarizeDepositRows(rows, opts.depositNetCents);

  const lines: Line[] = rows.map((r) => ({
    "Deposit ID": opts.depositId,
    "Settlement ID": r.settlementId ?? "",
    "Payment ID": r.transferId,
    Date: r.createdAt ? r.createdAt.toISOString() : "",
    [`${payer} Name`]: r.payerName === "—" ? "" : r.payerName,
    [`${payer} Email`]: r.payerEmail,
    "Student ID": r.studentNumber,
    "Student Name": r.studentName,
    Term: r.term,
    Fund: r.fundName,
    Note: r.note,
    Method: r.method === "—" ? "" : r.method,
    "Last Four": r.lastFour,
    State: r.state,
    Gross: dollars(r.grossCents),
    Fees: dollars(-r.feeCents),
    Refunds: dollars(-r.refundCents),
    "Bank Returns": dollars(-r.returnCents),
    Net: dollars(r.netCents),
  }));

  if (rows.length > 0 && summary.otherAdjustmentsCents !== 0) {
    lines.push({
      "Deposit ID": opts.depositId,
      "Payment ID": "Other settlement-level adjustments (e.g. settlement fee)",
      Net: dollars(summary.otherAdjustmentsCents),
    });
  }
  lines.push({
    "Deposit ID": opts.depositId,
    "Payment ID": "Deposit total",
    Gross: dollars(summary.grossCents),
    Fees: dollars(-summary.feeCents),
    Refunds: dollars(-summary.refundCents),
    "Bank Returns": dollars(-summary.returnCents),
    Net: dollars(summary.depositNetCents),
  });

  const studentOnly = new Set(["Student ID", "Student Name"]);
  const headers = [
    "Deposit ID",
    "Settlement ID",
    "Payment ID",
    "Date",
    `${payer} Name`,
    `${payer} Email`,
    "Student ID",
    "Student Name",
    "Term",
    "Fund",
    "Note",
    "Method",
    "Last Four",
    "State",
    "Gross",
    "Fees",
    "Refunds",
    "Bank Returns",
    "Net",
  ];
  const columns: CsvColumn<Line>[] = headers
    .filter((h) => (opts.showStudent || !studentOnly.has(h)) && (opts.showTerm || h !== "Term"))
    .map((header) => ({ header, value: (line) => line[header] ?? "", numeric: AMOUNT_HEADERS.has(header) }));

  return buildCsvExport(lines, columns);
}
