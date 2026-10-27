"use client";

import type { BackgroundOption } from "@/lib/campaigns/backgrounds";

/** Swatch row for choosing a campaign page / live wall background. */
export default function BackgroundPicker({
  label,
  options,
  value,
  onChange,
  hasImage,
  disabled,
}: {
  label: string;
  options: readonly BackgroundOption[];
  value: string;
  onChange: (key: string) => void;
  hasImage: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-2">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isImage = o.key === "image";
          const unavailable = isImage && !hasImage;
          const selected = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              disabled={disabled || unavailable}
              onClick={() => onChange(o.key)}
              title={unavailable ? "Upload a campaign image to use it as the background" : o.label}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                selected ? "border-indigo-500 ring-2 ring-indigo-200 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span
                className="inline-block h-4 w-4 rounded-full border border-slate-300"
                style={isImage ? { background: "linear-gradient(135deg,#94a3b8,#334155)" } : { backgroundColor: o.color }}
              />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
