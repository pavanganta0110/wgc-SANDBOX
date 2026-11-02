import { Download } from "lucide-react";
import { formatCents, formatSignedCents } from "@/lib/format";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import { modeLabel } from "@/lib/settings/paymentMode";
import { summarizeDepositRows, type DepositPaymentRow } from "@/lib/finix/depositPaymentRows";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import StateBadge from "@/components/merchant/StateBadge";

/**
 * Every payment inside a deposit — payer, student, note and amounts — with the
 * rows reconciled to the deposit total, so finance can match the bank deposit
 * and post entries. `variant="table"` is the full page; `variant="list"` fits
 * the narrow side drawer.
 */
export default function DepositPaymentsSection({
  rows,
  depositId,
  depositNetCents,
  showStudent,
  showTerm,
  paymentMode,
  canExport,
  variant,
}: {
  rows: DepositPaymentRow[];
  depositId: string;
  depositNetCents: number;
  showStudent: boolean;
  showTerm: boolean;
  paymentMode: boolean;
  canExport: boolean;
  variant: "table" | "list";
}) {
  const payer = modeLabel(paymentMode, "donor");
  const summary = summarizeDepositRows(rows, depositNetCents);
  const exportHref = `/api/merchant/transactions/deposits/${encodeURIComponent(depositId)}/payments-export`;
  const heading = `Included ${modeLabel(paymentMode, "donations")} (${rows.length})`;

  const exportLink = canExport && rows.length > 0 && (
    <a
      href={exportHref}
      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
    >
      <Download className="w-3.5 h-3.5" /> Download CSV
    </a>
  );

  const totals = rows.length > 0 && (
    <div className="mt-3 space-y-1 text-sm">
      <div className="flex justify-between text-slate-600">
        <span>{rows.length} {rows.length === 1 ? "payment" : "payments"}, net</span>
        <span>{formatCents(summary.rowsNetCents)}</span>
      </div>
      {summary.otherAdjustmentsCents !== 0 && (
        <div className="flex justify-between text-slate-600">
          <span>Other settlement-level adjustments (e.g. settlement fee)</span>
          <span>{formatSignedCents(summary.otherAdjustmentsCents)}</span>
        </div>
      )}
      <div className="flex justify-between font-bold text-slate-900 border-t border-slate-100 pt-1">
        <span>Deposit total</span>
        <span>{formatCents(summary.depositNetCents)}</span>
      </div>
    </div>
  );

  if (variant === "list") {
    return (
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{heading}</h4>
          {exportLink}
        </div>
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No payments linked to this deposit yet.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.transferId} className="rounded-lg border border-slate-100 p-2.5 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-800">{r.payerName}</span>
                  <span className="font-semibold text-slate-900">{formatCents(r.netCents)}</span>
                </div>
                {showStudent && (r.studentNumber || r.studentName) && (
                  <p className="text-slate-600">
                    Student {r.studentNumber ? `${r.studentNumber} · ` : ""}
                    {r.studentName}
                  </p>
                )}
                {showTerm && r.term && <p className="text-slate-600">Term {r.term}</p>}
                {r.note && <p className="text-slate-500 break-words">Note: {r.note}</p>}
                <p className="text-slate-400">
                  {formatDateTimeCDT(r.createdAt)} · Gross {formatCents(r.grossCents)}
                  {r.feeCents ? ` · Fees ${formatCents(r.feeCents)}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
        {totals}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-slate-900">{heading}</h3>
        {exportLink}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">No payments linked to this deposit yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px]">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                  <th className="py-2 pr-4">Payment ID</th>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">{payer}</th>
                  {showStudent && <th className="py-2 pr-4">Student ID</th>}
                  {showStudent && <th className="py-2 pr-4">Student</th>}
                  {showTerm && <th className="py-2 pr-4">Term</th>}
                  <th className="py-2 pr-4">Note</th>
                  <th className="py-2 pr-4 text-right">Gross</th>
                  <th className="py-2 pr-4 text-right">Fees</th>
                  <th className="py-2 pr-4 text-right">Refunds / Returns</th>
                  <th className="py-2 pr-4 text-right">Net</th>
                  <th className="py-2">State</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.transferId} className="border-t border-slate-50 align-top">
                    <td className="py-2 pr-4"><CopyableIdBadge id={r.transferId} /></td>
                    <td className="py-2 pr-4 text-slate-600 whitespace-nowrap">{formatDateTimeCDT(r.createdAt)}</td>
                    <td className="py-2 pr-4 text-slate-700">{r.payerName}</td>
                    {showStudent && <td className="py-2 pr-4 text-slate-700">{r.studentNumber || "—"}</td>}
                    {showStudent && <td className="py-2 pr-4 text-slate-700">{r.studentName || "—"}</td>}
                    {showTerm && <td className="py-2 pr-4 text-slate-600">{r.term || "—"}</td>}
                    <td className="py-2 pr-4 text-slate-600 max-w-[240px] break-words">{r.note || "—"}</td>
                    <td className="py-2 pr-4 text-right text-slate-900 font-semibold">{formatCents(r.grossCents)}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{formatSignedCents(-r.feeCents)}</td>
                    <td className="py-2 pr-4 text-right text-slate-600">{formatSignedCents(-(r.refundCents + r.returnCents))}</td>
                    <td className="py-2 pr-4 text-right font-semibold text-slate-900">{formatCents(r.netCents)}</td>
                    <td className="py-2"><StateBadge state={r.state} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-w-md ml-auto">{totals}</div>
        </>
      )}
    </div>
  );
}
