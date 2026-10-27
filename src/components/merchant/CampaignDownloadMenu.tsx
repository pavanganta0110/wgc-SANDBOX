"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { CAMPAIGN_EXPORT_FILTERS } from "@/lib/giving-campaigns-export";

/** Dropdown on a campaign's page: each option downloads only that group as CSV. */
export default function CampaignDownloadMenu({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <Download className="w-4 h-4" />
        Download list
        <ChevronDown className="w-4 h-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg z-20 py-1">
          {CAMPAIGN_EXPORT_FILTERS.map((f) => (
            <a
              key={f.key}
              role="menuitem"
              href={`/api/merchant/giving-campaigns/${id}/export?filter=${f.key}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {f.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
