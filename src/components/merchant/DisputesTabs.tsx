"use client";

import Link from "next/link";

export default function DisputesTabs({
  active,
  allCount,
  needsAttentionCount,
}: {
  active: "all" | "needs_attention";
  allCount: number;
  needsAttentionCount: number;
}) {
  const tabs = [
    { key: "all", label: `All (${allCount})`, href: "/merchant/disputes" },
    { key: "needs_attention", label: `Needs Attention (${needsAttentionCount})`, href: "/merchant/disputes?tab=needs_attention" },
  ] as const;

  return (
    <div className="flex items-center gap-1 border-b border-slate-100 mb-4">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            active === t.key ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
