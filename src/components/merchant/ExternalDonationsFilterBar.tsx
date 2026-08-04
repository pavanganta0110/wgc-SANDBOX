"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import { EXTERNAL_PAYMENT_METHODS, EXTERNAL_PAYMENT_METHOD_LABELS, RECEIPT_STATUSES, RECEIPT_STATUS_LABELS, type ExternalPaymentMethod, type ReceiptStatus } from "@/lib/donations/externalDonationTypes";

export default function ExternalDonationsFilterBar({ canExport }: { canExport: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = searchParams.get("q") || "";
  const [searchInput, setSearchInput] = useState(q);
  const method = searchParams.get("method") || "";
  const receiptStatus = searchParams.get("receiptStatus") || "";
  const deductible = searchParams.get("deductible") || "";
  const source = searchParams.get("source") || "";

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (searchInput !== q) setParam("q", searchInput);
    }, 400);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeFilterCount = [method, receiptStatus, deductible, source].filter(Boolean).length;

  const clearFilters = () => {
    setSearchInput("");
    router.push(pathname);
  };

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap" role="search" aria-label="Filter external donations">
      <DateRangePicker />

      <label className="sr-only" htmlFor="ext-donations-search">
        Search donor name or email
      </label>
      <input
        id="ext-donations-search"
        type="text"
        placeholder="Search donor, fund, or reference number"
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="px-4 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none w-64"
      />

      <label className="sr-only" htmlFor="ext-donations-method">
        Payment method
      </label>
      <select
        id="ext-donations-method"
        value={method}
        onChange={(e) => setParam("method", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">All payment methods</option>
        {EXTERNAL_PAYMENT_METHODS.map((m) => (
          <option key={m} value={m}>
            {EXTERNAL_PAYMENT_METHOD_LABELS[m as ExternalPaymentMethod]}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="ext-donations-receipt-status">
        Receipt status
      </label>
      <select
        id="ext-donations-receipt-status"
        value={receiptStatus}
        onChange={(e) => setParam("receiptStatus", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">All receipt statuses</option>
        {RECEIPT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {RECEIPT_STATUS_LABELS[s as ReceiptStatus]}
          </option>
        ))}
      </select>

      <label className="sr-only" htmlFor="ext-donations-deductible">
        Tax-deductible status
      </label>
      <select
        id="ext-donations-deductible"
        value={deductible}
        onChange={(e) => setParam("deductible", e.target.value)}
        className="px-3 py-2 rounded-full border border-slate-200 text-sm text-slate-700 bg-white outline-none"
      >
        <option value="">Tax-deductible: any</option>
        <option value="yes">Tax-deductible: yes</option>
        <option value="no">Tax-deductible: no</option>
      </select>

      <label className="sr-only" htmlFor="ext-donations-source">
        Source
      </label>
      <select
        id="ext-donations-source"
        value={source}
        onChange={(e) => setParam("source", e.target.value)}
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

      {canExport && (
        <a
          href={`/api/merchant/donations/external/export?${searchParams.toString()}`}
          className="ml-auto px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50"
        >
          Export CSV
        </a>
      )}
    </div>
  );
}
