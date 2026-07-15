"use client";

import { useRouter, useSearchParams } from "next/navigation";

const TABS = [
  { key: "payments", label: "Payments" },
  { key: "authorizations", label: "Authorizations" },
  { key: "refunds", label: "Refunds" },
  { key: "disputes", label: "Disputes" },
  { key: "bank-returns", label: "Bank Returns" },
  { key: "deposits", label: "Deposits" },
];

export default function InsightsTabs() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "payments";

  const handleClick = (key: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-6 border-b border-slate-100">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => handleClick(tab.key)}
          className={`pb-3 text-sm font-semibold border-b-2 -mb-px transition-colors ${
            currentTab === tab.key
              ? "text-blue-600 border-blue-600"
              : "text-slate-500 border-transparent hover:text-slate-700"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
