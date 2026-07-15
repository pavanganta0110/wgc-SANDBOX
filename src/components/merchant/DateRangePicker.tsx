"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { RANGE_PRESETS, DEFAULT_RANGE_KEY, rangeLabel } from "@/lib/dateRangePresets";

function toInputValue(d: Date | null) {
  if (!d) return "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export default function DateRangePicker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentRangeKey = searchParams.get("range") || DEFAULT_RANGE_KEY;
  const currentFrom = searchParams.get("from") || undefined;
  const currentTo = searchParams.get("to") || undefined;

  const [isOpen, setIsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<string>(currentRangeKey);
  const [fromDate, setFromDate] = useState<Date | null>(currentFrom ? new Date(currentFrom) : null);
  const [toDate, setToDate] = useState<Date | null>(currentTo ? new Date(currentTo) : null);
  const [calendarMonth, setCalendarMonth] = useState<Date>(fromDate || new Date());

  const applyPreset = (key: string) => {
    setSelectedPreset(key);
    const preset = RANGE_PRESETS.find((p) => p.key === key);
    if (preset) {
      const { from, to } = preset.compute();
      setFromDate(from);
      setToDate(to);
      if (from) setCalendarMonth(from);
    }
  };

  const handleDayClick = (day: Date) => {
    setSelectedPreset("custom");
    if (!fromDate || (fromDate && toDate)) {
      setFromDate(day);
      setToDate(null);
    } else if (day < fromDate) {
      setToDate(fromDate);
      setFromDate(day);
    } else {
      setToDate(day);
    }
  };

  const handleClear = () => {
    setSelectedPreset(DEFAULT_RANGE_KEY);
    applyPreset(DEFAULT_RANGE_KEY);
  };

  const handleDone = () => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedPreset === "custom" && fromDate && toDate) {
      params.set("range", "custom");
      params.set("from", fromDate.toISOString().slice(0, 10));
      params.set("to", toDate.toISOString().slice(0, 10));
    } else {
      params.set("range", selectedPreset);
      params.delete("from");
      params.delete("to");
    }
    router.push(`?${params.toString()}`);
    setIsOpen(false);
  };

  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const totalDays = daysInMonth(year, month);
  const monthLabel = calendarMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const isInRange = (day: Date) => {
    if (!fromDate) return false;
    const end = toDate ?? fromDate;
    return day >= fromDate && day <= end;
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-full border text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 ${
          isOpen ? "border-slate-900" : "border-slate-200"
        }`}
      >
        {rangeLabel(currentRangeKey, currentFrom, currentTo)}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute left-1/2 -translate-x-1/2 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl flex overflow-hidden w-[720px] max-w-[95vw]">
            <div className="w-48 border-r border-slate-100 py-2">
              {RANGE_PRESETS.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => applyPreset(preset.key)}
                  className={`w-full text-left px-4 py-2.5 text-sm ${
                    selectedPreset === preset.key
                      ? "bg-slate-100 font-bold text-slate-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setSelectedPreset("custom")}
                className={`w-full text-left px-4 py-2.5 text-sm ${
                  selectedPreset === "custom"
                    ? "bg-slate-100 font-bold text-slate-900"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Custom
              </button>
            </div>

            <div className="flex-grow p-5">
              <div className="flex items-center gap-3 mb-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">From</label>
                  <input
                    readOnly
                    value={toInputValue(fromDate)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-32"
                  />
                </div>
                <span className="text-slate-400 mt-5">→</span>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">To</label>
                  <input
                    readOnly
                    value={toInputValue(toDate)}
                    className="px-3 py-2 rounded-lg border border-slate-200 text-sm w-32"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCalendarMonth(new Date(year - 1, month, 1))}
                    aria-label="Previous year"
                  >
                    <ChevronsLeft className="w-4 h-4 text-slate-500" />
                  </button>
                  <button
                    onClick={() => setCalendarMonth(new Date(year, month - 1, 1))}
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
                <p className="text-sm font-bold text-slate-900">{monthLabel}</p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCalendarMonth(new Date(year, month + 1, 1))}
                    aria-label="Next month"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </button>
                  <button
                    onClick={() => setCalendarMonth(new Date(year + 1, month, 1))}
                    aria-label="Next year"
                  >
                    <ChevronsRight className="w-4 h-4 text-slate-500" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                  <div key={d} className="text-xs font-semibold text-slate-400 py-1">
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} />
                ))}
                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = new Date(year, month, i + 1);
                  const inRange = isInRange(day);
                  return (
                    <button
                      key={i}
                      onClick={() => handleDayClick(day)}
                      className={`text-sm py-2 rounded-full ${
                        inRange
                          ? "bg-blue-100 text-blue-900 font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {i + 1}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 mt-5 pt-4 border-t border-slate-100">
                <button
                  onClick={handleClear}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
                >
                  Clear
                </button>
                <button
                  onClick={handleDone}
                  className="px-5 py-2 rounded-xl bg-[#eab308] text-sm font-bold text-slate-900"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
