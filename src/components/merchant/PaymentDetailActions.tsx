"use client";

import { useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { ChevronUp, ChevronDown, MoreHorizontal, Pin } from "lucide-react";

function showComingSoon(feature: string) {
  toast(`${feature} is coming soon.`, { icon: "🚧" });
}

export function PanelNavArrows() {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => showComingSoon("Row navigation")}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <button
        onClick={() => showComingSoon("Row navigation")}
        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ViewAllDetailsButton({ href }: { href?: string }) {
  if (href) {
    return (
      <Link
        href={href}
        className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        View All Details
      </Link>
    );
  }
  return (
    <button
      onClick={() => showComingSoon("Full payment details page")}
      className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
    >
      View All Details
    </button>
  );
}

export function PaymentMoreMenu() {
  return (
    <button
      onClick={() => showComingSoon("More actions")}
      className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
  );
}

export function PinButton() {
  return (
    <button
      onClick={() => showComingSoon("Pinning")}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
    >
      <Pin className="w-4 h-4" />
    </button>
  );
}

export type RowAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  requiresConfirm?: boolean;
  confirmMessage?: string;
};

// State-aware row/panel action menu: caller computes `hidden`/`disabled` per item
// (e.g. hide a dispute's "Submit Response" once it's closed), so invalid actions
// never render rather than rendering disabled.
export function RowActionsMenu({ items }: { items: RowAction[] }) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.filter((item) => !item.hidden);

  if (visibleItems.length === 0) {
    return (
      <button
        disabled
        className="p-2 rounded-lg border border-slate-200 text-slate-300 cursor-not-allowed"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl py-2 w-56">
            {visibleItems.map((item, i) => (
              <button
                key={i}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  if (item.requiresConfirm) {
                    if (window.confirm(item.confirmMessage ?? `${item.label}?`)) item.onClick();
                    return;
                  }
                  item.onClick();
                }}
                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function ComingSoonAction({
  label,
  feature,
  className,
}: {
  label: string;
  feature: string;
  className?: string;
}) {
  return (
    <button onClick={() => showComingSoon(feature)} className={className}>
      {label}
    </button>
  );
}
