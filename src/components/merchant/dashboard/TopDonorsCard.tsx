import Link from "next/link";
import { Users } from "lucide-react";
import { formatCents } from "@/lib/format";
import { initialsOf, type TopDonor } from "@/lib/reports/dashboardHome";

/** Avatar tints: neutral indigo/slate steps, not data colours. */
const TINTS = ["bg-indigo-50 text-indigo-700", "bg-slate-100 text-slate-700", "bg-sky-50 text-sky-700", "bg-violet-50 text-violet-700", "bg-teal-50 text-teal-700"];

export default function TopDonorsCard({ donors }: { donors: TopDonor[] }) {
  const max = Math.max(...donors.map((d) => d.amountCents), 1);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Top donors</h2>
          <p className="mt-0.5 text-xs text-slate-500">By amount given in the selected period</p>
        </div>
        <Link href="/merchant/donors" className="rounded text-sm font-semibold text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
          All donors
        </Link>
      </div>

      {donors.length === 0 ? (
        <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-8 text-center">
          <Users className="h-5 w-5 text-slate-400" aria-hidden />
          <p className="text-sm text-slate-600">No donors yet. Your top givers appear here after the first gift.</p>
        </div>
      ) : (
        <ol className="mt-4 divide-y divide-slate-100">
          {donors.map((d, i) => {
            const link = d.name === "Anonymous donor" ? null : `/merchant/donors/${d.donorId}`;
            const row = (
              <>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${TINTS[i % TINTS.length]}`} aria-hidden>
                  {initialsOf(d.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-slate-900">{d.name}</span>
                  <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${Math.max(4, (d.amountCents / max) * 100)}%` }} />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-sm font-bold text-slate-900 tabular-nums">{formatCents(d.amountCents)}</span>
                  <span className="block text-xs text-slate-400 tabular-nums">
                    {d.gifts} gift{d.gifts === 1 ? "" : "s"}
                  </span>
                </span>
              </>
            );
            return (
              <li key={d.donorId}>
                {link ? (
                  <Link href={link} className="flex items-center gap-3 rounded-lg py-3 transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                    {row}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 py-3">{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
