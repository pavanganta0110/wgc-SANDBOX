"use client";

import { X } from "lucide-react";
import type {
  ReactNode,
  SelectHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";

export const FOCUS =
  "outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/** Secondary toolbar button (Filters, Columns, Save). */
export function ToolButton({
  icon,
  children,
  badge,
  active,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  badge?: number;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold shadow-sm transition motion-reduce:transition-none ${FOCUS} ${
        active
          ? "border-indigo-300 bg-indigo-50 text-indigo-800"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      } disabled:opacity-50 ${className}`}
    >
      {icon}
      {children}
      {badge ? (
        <span className="ml-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[11px] font-bold text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function PrimaryButton({
  icon,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 motion-reduce:transition-none ${FOCUS} disabled:opacity-50 ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

/** Styled native select (keeps native keyboard + mobile behavior). */
export function SelectField({
  label,
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select
        {...rest}
        className={`h-10 appearance-none rounded-xl border border-slate-200 bg-white pl-3.5 pr-9 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 motion-reduce:transition-none ${FOCUS} ${className}`}
      >
        {children}
      </select>
      <svg
        className="pointer-events-none absolute right-3 h-4 w-4 text-slate-500"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden
      >
        <path
          d="M5.5 7.5 10 12l4.5-4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </label>
  );
}

export function FilterChip({
  label,
  onClear,
}: {
  label: string;
  onClear: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-indigo-800">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Remove filter ${label}`}
        className={`rounded-full p-0.5 hover:bg-indigo-100 ${FOCUS}`}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
}

/** Pill toggle used for exclusive choices (Gross / Net, Only me / Whole team). */
export function SegmentedChoice<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl bg-slate-100 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold transition motion-reduce:transition-none ${FOCUS} ${value === o.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
