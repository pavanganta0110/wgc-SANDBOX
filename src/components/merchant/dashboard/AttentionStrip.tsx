import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight } from "lucide-react";
import type { AttentionItem } from "@/lib/reports/dashboardHome";

/** Compact clickable chips for anything that needs a human. With nothing to
 * flag it collapses to a quiet one-line "all clear". */
export default function AttentionStrip({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
        All clear. No open disputes, failed payments or returns.
      </p>
    );
  }
  return (
    <section aria-labelledby="needs-attention" className="flex flex-wrap items-center gap-2.5">
      <h2 id="needs-attention" className="mr-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        Needs attention
      </h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="group inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 py-1.5 pl-3 pr-2 text-sm font-semibold text-amber-900 transition hover:-translate-y-px hover:border-amber-300 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              {item.label}
              <ChevronRight className="h-3.5 w-3.5 text-amber-700 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
