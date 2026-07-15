import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatCents } from "@/lib/format";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import { titleCaseFromSnake as titleCase } from "@/lib/finix/displayFormatters";
import type { DonorAnalyticsExtended } from "@/lib/donors/donorAnalyticsExtended";
import type { PaymentMethodMixRow } from "@/lib/donors/donorBreakdowns";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <h3 className="text-sm font-bold text-slate-900 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Split({ leftLabel, leftValue, leftAmount, rightLabel, rightValue, rightAmount }: any) {
  const total = leftAmount + rightAmount;
  const leftPct = total > 0 ? Math.round((leftAmount / total) * 100) : 0;
  return (
    <div>
      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100 mb-3">
        <div className="bg-blue-500" style={{ width: `${leftPct}%` }} />
        <div className="bg-slate-300" style={{ width: `${100 - leftPct}%` }} />
      </div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-600">{leftLabel}</span>
        <span className="font-semibold text-slate-900">{leftValue} · {formatCents(leftAmount)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{rightLabel}</span>
        <span className="font-semibold text-slate-900">{rightValue} · {formatCents(rightAmount)}</span>
      </div>
    </div>
  );
}

export default function DonorAnalyticsExtras({
  extended,
  paymentMethodMix,
}: {
  extended: DonorAnalyticsExtended;
  paymentMethodMix: PaymentMethodMixRow[];
}) {
  const { newVsReturning, oneTimeVsRecurring, statusBreakdown, retention, concentration, attentionList } = extended;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
      <Card title="New vs Returning Donors">
        <Split
          leftLabel="New"
          leftValue={newVsReturning.newCount}
          leftAmount={newVsReturning.newAmountCents}
          rightLabel="Returning"
          rightValue={newVsReturning.returningCount}
          rightAmount={newVsReturning.returningAmountCents}
        />
      </Card>

      <Card title="Donation Type">
        <Split
          leftLabel="Recurring"
          leftValue={oneTimeVsRecurring.recurringCount}
          leftAmount={oneTimeVsRecurring.recurringAmountCents}
          rightLabel="One-Time"
          rightValue={oneTimeVsRecurring.oneTimeCount}
          rightAmount={oneTimeVsRecurring.oneTimeAmountCents}
        />
      </Card>

      <Card title="Donor Status">
        <div className="space-y-2">
          {(["ACTIVE", "RECURRING", "AT_RISK", "INACTIVE"] as const).map((s) => (
            <div key={s} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{titleCase(s)}</span>
              <span className="font-semibold text-slate-900">{statusBreakdown[s]}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Donor Retention">
        {retention.insufficientData ? (
          <p className="text-sm text-slate-400">Insufficient historical data for this period.</p>
        ) : (
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-slate-600">Returning Donor Rate</span><span className="font-semibold text-slate-900">{retention.returningDonorRate != null ? `${Math.round(retention.returningDonorRate * 100)}%` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Repeat Donation Rate</span><span className="font-semibold text-slate-900">{retention.repeatDonationRate != null ? `${Math.round(retention.repeatDonationRate * 100)}%` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Recurring Donor Rate</span><span className="font-semibold text-slate-900">{retention.recurringDonorRate != null ? `${Math.round(retention.recurringDonorRate * 100)}%` : "—"}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Retained</span><span className="font-semibold text-slate-900">{retention.retainedDonors}</span></div>
            <div className="flex justify-between"><span className="text-slate-600">Lapsed</span><span className="font-semibold text-slate-900">{retention.lapsedDonors}</span></div>
          </div>
        )}
      </Card>

      <Card title="Donation Concentration">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Top 1 Donor</span><span className="font-semibold text-slate-900">{concentration.top1SharePct.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Top 5 Donors</span><span className="font-semibold text-slate-900">{concentration.top5SharePct.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Top 10 Donors</span><span className="font-semibold text-slate-900">{concentration.top10SharePct.toFixed(1)}%</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Remaining Donors</span><span className="font-semibold text-slate-900">{concentration.remainingSharePct.toFixed(1)}%</span></div>
        </div>
        {concentration.top10SharePct >= 50 && (
          <p className="text-xs text-amber-600 mt-2">Donation concentration is high.</p>
        )}
      </Card>

      <Card title="Payment Method Mix">
        {paymentMethodMix.length === 0 ? (
          <p className="text-sm text-slate-400">No donation activity for this period.</p>
        ) : (
          <div className="space-y-2">
            {paymentMethodMix.map((m) => (
              <div key={m.method} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{titleCase(m.method)}</span>
                <span className="font-semibold text-slate-900">{formatCents(m.amountCents)} <span className="text-slate-400 font-normal">· {m.count}</span></span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Donors Requiring Attention">
        {attentionList.length === 0 ? (
          <p className="text-sm text-slate-400">No donors currently require attention.</p>
        ) : (
          <div className="space-y-2">
            {attentionList.slice(0, 5).map((a) => (
              <Link key={a.donorId} href={`/merchant/donors/${a.donorId}`} className="flex items-start gap-2 text-sm hover:bg-slate-50 -mx-2 px-2 py-1 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{a.name}</p>
                  <p className="text-xs text-slate-500">{a.reasons.join(", ")}</p>
                  {a.lastEventAt && <p className="text-xs text-slate-400">{formatDateCDT(a.lastEventAt)}</p>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
