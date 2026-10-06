import Link from "next/link";
import { Repeat, UserMinus } from "lucide-react";
import Card, { EmptyNote } from "./Card";
import Tip from "./Tip";
import InfoTip from "./InfoTip";
import { SERIES } from "./tokens";
import { percent } from "./format";

export default function DonorMixDonut({
  newCount,
  returningCount,
  recurring,
  lapsed,
  year,
}: {
  newCount: number;
  returningCount: number;
  recurring: number;
  lapsed: number;
  year: number;
}) {
  const total = newCount + returningCount;
  const r = 52;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && newCount > 0 && returningCount > 0 ? 3 : 0;
  const segs = [
    {
      key: "new",
      label: "New",
      count: newCount,
      color: SERIES.indigo,
      note: `First gift in ${year}`,
    },
    {
      key: "returning",
      label: "Returning",
      count: returningCount,
      color: SERIES.teal,
      note: `Gave before ${year}, and again in ${year}`,
    },
  ];
  let offset = 0;

  return (
    <Card
      title="New vs returning donors"
      subtitle={`Donors who gave in ${year}`}
    >
      {total === 0 ? (
        <EmptyNote
          title="No donors have given yet"
          body="Once donors give, you'll see how many are new and how many keep coming back."
        />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
          <div
            className="relative h-36 w-36 shrink-0"
            role="img"
            aria-label={`${newCount} new donors and ${returningCount} returning donors`}
          >
            <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#F1F5F9"
                strokeWidth="10"
              />
              {segs.map((s) => {
                const len = (s.count / total) * c;
                const el =
                  s.count > 0 ? (
                    <circle
                      key={s.key}
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke={s.color}
                      strokeWidth="10"
                      strokeDasharray={`${Math.max(len - gap, 0)} ${c}`}
                      strokeDashoffset={-offset}
                    />
                  ) : null;
                offset += len;
                return el;
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tabular-nums text-slate-900">
                {total.toLocaleString("en-US")}
              </span>
              <span className="text-[11px] font-medium text-slate-500">
                donors
              </span>
            </div>
          </div>
          <ul className="w-full min-w-0 flex-1 space-y-2">
            {segs.map((s) => (
              <li key={s.key}>
                <Tip content={s.note} className="w-full" side="top">
                  <span className="flex w-full items-center gap-2 text-sm">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: s.color }}
                      aria-hidden
                    />
                    <span className="font-medium text-slate-700">
                      {s.label}
                    </span>
                    <span className="ml-auto font-bold tabular-nums text-slate-900">
                      {s.count.toLocaleString("en-US")}
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-500">
                      {percent((s.count / total) * 100)}
                    </span>
                  </span>
                </Tip>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
        <Link
          href="/merchant/reporting/recurring"
          className="group -m-1 flex items-center gap-2.5 rounded-xl p-1 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"
            aria-hidden
          >
            <Repeat className="h-4 w-4" />
          </span>
          <div>
            <div className="text-lg font-bold leading-none tabular-nums text-slate-900">
              {recurring.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Recurring
              <InfoTip
                label="Recurring donors"
                text="Donors giving on a recurring schedule (monthly, weekly and so on)."
              />
            </div>
          </div>
        </Link>
        <Link
          href="/merchant/reporting/lapsed"
          className="group -m-1 flex items-center gap-2.5 rounded-xl p-1 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
        >
          <span
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"
            aria-hidden
          >
            <UserMinus className="h-4 w-4" />
          </span>
          <div>
            <div className="text-lg font-bold leading-none tabular-nums text-slate-900">
              {lapsed.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Lapsed
              <InfoTip
                label="Lapsed donors"
                text={`Gave in ${year - 1} but haven't given yet in ${year}.`}
              />
            </div>
          </div>
        </Link>
      </div>
    </Card>
  );
}
