import Link from "next/link";
import Card, { EmptyNote } from "@/components/merchant/reporting/overview/Card";
import { formatCents, percent } from "@/components/merchant/reporting/overview/format";

export interface TopMerchantRow {
  churchId: string;
  name: string;
  amountCents: number;
  count: number;
}

export default function TopMerchants({
  rows,
  totalCents,
  periodLabel,
}: {
  rows: TopMerchantRow[];
  totalCents: number;
  periodLabel: string;
}) {
  const max = rows[0]?.amountCents ?? 0;
  return (
    <Card
      title="Top merchants by volume"
      subtitle={periodLabel}
      action={
        <Link href="/admin/merchants" className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          All merchants
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyNote title="No merchant volume yet" body="Merchants that process payments in this period will rank here." />
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={r.churchId}>
              <Link
                href={`/admin/merchants/${r.churchId}`}
                className="block rounded-xl px-2 py-2 outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-indigo-500 motion-reduce:transition-none"
              >
                <span className="flex items-baseline gap-2 text-sm">
                  <span className="w-4 shrink-0 text-xs tabular-nums text-slate-400">{i + 1}</span>
                  <span className="min-w-0 truncate font-medium text-slate-700">{r.name}</span>
                  <span className="ml-auto font-bold tabular-nums text-slate-900">{formatCents(r.amountCents)}</span>
                  <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-500">
                    {percent(totalCents > 0 ? (r.amountCents / totalCents) * 100 : 0)}
                  </span>
                </span>
                <span className="ml-6 mt-1.5 block h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-indigo-500"
                    style={{ width: `${max > 0 ? (r.amountCents / max) * 100 : 0}%` }}
                  />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
