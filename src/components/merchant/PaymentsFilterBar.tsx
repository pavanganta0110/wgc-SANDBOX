"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Download, ChevronDown, Search, X } from "lucide-react";
import DateRangePicker from "@/components/merchant/DateRangePicker";
import PillFilterInput from "@/components/merchant/PillFilterInput";
import ExportOptionsDialog from "@/components/merchant/ExportOptionsDialog";
import { usePaymentWording } from "@/components/merchant/PaymentModeContext";

const STATES = [
  "SUCCEEDED",
  "FAILED",
  "PENDING",
  "CANCELED",
  "RETURNED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
  "REFUND_PENDING",
];

const SOURCES = [
  { value: "EVENTS", label: "Events" },
  { value: "CAMPAIGNS", label: "Fundraising campaigns" },
  { value: "GIVING_PAGES", label: "Giving pages" },
  { value: "OTHER", label: "Other" },
];

export default function PaymentsFilterBar({ fundSuggestions = [] }: { fundSuggestions?: string[] }) {
  const pw = usePaymentWording();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [exportFormat, setExportFormat] = useState<"csv" | "pdf" | null>(null);
  const state = searchParams.get("state") || "";
  const last4 = searchParams.get("last4") || "";
  const donorName = searchParams.get("buyer") || "";
  const fund = searchParams.get("fund") || "";
  const source = searchParams.get("source") || "";
  const query = searchParams.get("q") || "";
  const [searchDraft, setSearchDraft] = useState(query);
  const [isStateOpen, setIsStateOpen] = useState(false);
  const [isSourceOpen, setIsSourceOpen] = useState(false);

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`?${params.toString()}`);
  };

  const titleCaseState = (s: string) =>
    s
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  const stateLabel = state ? titleCaseState(state) : "State";

  return (
    <div className="flex items-center gap-3 mb-4 flex-wrap">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          setParam("q", searchDraft.trim());
        }}
        className="relative w-full sm:w-80"
      >
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="search"
          value={searchDraft}
          maxLength={100}
          onChange={(e) => setSearchDraft(e.target.value)}
          placeholder="Search name, student ID, amount, note…"
          aria-label="Search payments"
          className="w-full pl-9 pr-8 py-2 rounded-full border border-slate-200 bg-white text-sm outline-none focus:border-slate-900"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setSearchDraft("");
              setParam("q", "");
            }}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </form>

      <DateRangePicker />

      <div className="relative">
        <button
          onClick={() => setIsStateOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isStateOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {stateLabel}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform ${isStateOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isStateOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsStateOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-52">
              <button
                onClick={() => {
                  setParam("state", "");
                  setIsStateOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                All States
              </button>
              {STATES.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setParam("state", s);
                    setIsStateOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {titleCaseState(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="relative">
        <button
          onClick={() => setIsSourceOpen((o) => !o)}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
            isSourceOpen ? "border-slate-900" : "border-slate-200"
          }`}
        >
          {SOURCES.find((s) => s.value === source)?.label ?? "Source"}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isSourceOpen ? "rotate-180" : ""}`} />
        </button>
        {isSourceOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsSourceOpen(false)} />
            <div className="absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-56">
              <button
                onClick={() => {
                  setParam("source", "");
                  setIsSourceOpen(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                All Sources
              </button>
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  onClick={() => {
                    setParam("source", s.value);
                    setIsSourceOpen(false);
                  }}
                  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <PillFilterInput
        label="Fund / Designation"
        value={fund}
        width="w-64"
        placeholder="e.g. General Fund"
        suggestions={fundSuggestions}
        onApply={(v) => setParam("fund", v)}
      />

      <PillFilterInput
        label="Last Four"
        value={last4}
        maxLength={4}
        width="w-48"
        placeholder="Payment instrument last 4 digits"
        onApply={(v) => setParam("last4", v)}
      />

      <PillFilterInput
        label={pw("Donor Name")}
        value={donorName}
        width="w-56"
        placeholder={pw("Donor or payment instrument name")}
        onApply={(v) => setParam("buyer", v)}
      />

      <div className="h-6 w-px bg-slate-200" />

      <button
        type="button"
        onClick={() => setExportFormat("csv")}
        className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => setExportFormat("pdf")}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Download className="w-4 h-4" />
        Export PDF
      </button>
      {exportFormat && (
        <ExportOptionsDialog
          format={exportFormat}
          exportUrl={`/api/merchant/transactions/payments/export?${new URLSearchParams({
            ...Object.fromEntries(searchParams),
            ...(exportFormat === "pdf" ? { format: "pdf" } : {}),
          }).toString()}`}
          onClose={() => setExportFormat(null)}
        />
      )}
    </div>
  );
}
