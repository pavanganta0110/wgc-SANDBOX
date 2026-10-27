"use client";

import type { Option } from "@/lib/campaigns/display";

/** Chip row for choosing one of a few presets (sizes, fonts). */
export default function OptionPicker({
  label,
  options,
  value,
  onChange,
  disabled,
}: {
  label: string;
  options: readonly Option[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onChange(o.key)}
            aria-pressed={value === o.key}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
              value === o.key ? "border-indigo-500 ring-2 ring-indigo-200 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
