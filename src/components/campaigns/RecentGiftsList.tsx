import { formatCents } from "@/lib/format";

export interface GiftDisplay {
  id: string;
  amountCents: number;
  donorName: string;
  message?: string | null;
  createdAt: string | Date;
}

export default function RecentGiftsList({ gifts, emptyLabel = "Be the first to give!" }: { gifts: GiftDisplay[]; emptyLabel?: string }) {
  if (gifts.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-6">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-3">
      {gifts.map((g) => (
        <li key={g.id} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 last:border-0">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{g.donorName}</p>
            {g.message && <p className="text-xs text-slate-500 mt-0.5 truncate">&quot;{g.message}&quot;</p>}
          </div>
          <p className="text-sm font-bold text-slate-900 shrink-0">{formatCents(g.amountCents)}</p>
        </li>
      ))}
    </ul>
  );
}
