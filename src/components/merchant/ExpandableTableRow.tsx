"use client";

import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

/**
 * A table row that expands to show a detail panel beneath it. The cells and
 * the detail are rendered on the server and passed in as children, so this
 * client component only owns the open/closed toggle.
 */
export default function ExpandableTableRow({
  children,
  detail,
  colSpan,
  label,
  expandable = true,
}: {
  children: ReactNode;
  detail: ReactNode;
  colSpan: number;
  label: string;
  expandable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className={`border-t border-slate-50 ${expandable ? "cursor-pointer hover:bg-slate-50" : ""}`}
        onClick={
          expandable
            ? (e) => {
                // Links inside the row (View, donor names) navigate; they must not toggle it.
                if ((e.target as HTMLElement).closest("a, button")) return;
                setOpen((o) => !o);
              }
            : undefined
        }
      >
        <td className="pl-4 pr-0 py-3 w-6 align-top">
          {expandable && (
            <button
              type="button"
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} who paid — ${label}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpen((o) => !o);
              }}
              className="text-slate-400 hover:text-slate-700"
            >
              <ChevronRight className={`w-4 h-4 transition-transform ${open ? "rotate-90" : ""}`} />
            </button>
          )}
        </td>
        {children}
      </tr>
      {open && (
        <tr className="bg-slate-50/60">
          <td colSpan={colSpan + 1} className="px-4 sm:px-8 py-4">
            {detail}
          </td>
        </tr>
      )}
    </>
  );
}
