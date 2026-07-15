"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function PillFilterInput({
  label,
  value,
  maxLength,
  width = "w-48",
  placeholder,
  onApply,
}: {
  label: string;
  value: string;
  maxLength?: number;
  width?: string;
  placeholder?: string;
  onApply: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setDraft(value);
          setIsOpen((o) => !o);
        }}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
          isOpen ? "border-slate-900" : "border-slate-200"
        }`}
      >
        {value ? `${label}: ${value}` : label}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className={`absolute left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 ${width}`}>
            <input
              autoFocus
              type="text"
              maxLength={maxLength}
              placeholder={placeholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  onApply(draft);
                  setIsOpen(false);
                }
              }}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#eab308]"
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <button
                onClick={() => {
                  onApply("");
                  setDraft("");
                  setIsOpen(false);
                }}
                className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-900"
              >
                Clear
              </button>
              <button
                onClick={() => {
                  onApply(draft);
                  setIsOpen(false);
                }}
                className="px-4 py-1.5 rounded-lg bg-[#eab308] text-sm font-bold text-slate-900"
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
