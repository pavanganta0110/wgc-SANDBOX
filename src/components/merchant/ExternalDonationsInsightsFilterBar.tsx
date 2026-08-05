"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { EXTERNAL_PAYMENT_METHODS, EXTERNAL_PAYMENT_METHOD_LABELS, RECEIPT_STATUSES, RECEIPT_STATUS_LABELS, type ExternalPaymentMethod, type ReceiptStatus } from "@/lib/donations/externalDonationTypes";

interface Fund {
  id: string;
  name: string;
}

export default function ExternalDonationsInsightsFilterBar({ funds }: { funds: Fund[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const extMethod = searchParams.get("extMethod") || "";
  const extReceiptStatus = searchParams.get("extReceiptStatus") || "";
  const extFund = searchParams.get("extFund") || "";
  const extSource = searchParams.get("extSource") || "";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const activeFilterCount = [extMethod, extReceiptStatus, extFund, extSource].filter(Boolean).length;

  const clearFilters = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("extMethod");
    params.delete("extReceiptStatus");
    params.delete("extFund");
    params.delete("extSource");
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="flex items-center gap-3 flex-wrap" role="search" aria-label="Filter external donations report">
      <select
        aria-label="Payment method"
        value={extMethod}
        onChange={(e) => setParam("extMethod", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">All payment methods</option>
        {EXTERNAL_PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {EXTERNAL_PAYMENT_METHOD_LABELS[m as ExternalPaymentMethod]}
          </option>
        ))}
      </select>

      <select
        aria-label="Receipt status"
        value={extReceiptStatus}
        onChange={(e) => setParam("extReceiptStatus", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">All receipt statuses</option>
        {RECEIPT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RECEIPT_STATUS_LABELS[s as ReceiptStatus]}
          </option>
        ))}
      </select>

      <select
        aria-label="Fund"
        value={extFund}
        onChange={(e) => setParam("extFund", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">All funds</option>
        {funds.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Source"
        value={extSource}
        onChange={(e) => setParam("extSource", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">Manual + imported</option>
        <option value="manual">Manually entered</option>
        <option value="imported">Imported</option>
      </select>

      {activeFilterCount > 0 && (
        <button onClick={clearFilters} className="text-sm text-slate-500 hover:text-slate-700 underline">
          Clear filters
        </button>
      )}
    </div>
  );
}
