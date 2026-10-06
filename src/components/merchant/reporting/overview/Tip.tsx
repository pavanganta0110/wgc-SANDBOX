import type { ReactNode } from "react";

/**
 * CSS-only hover/focus tooltip so server-rendered marks (bars, donut segments)
 * get a tooltip without client JS. The trigger is focusable for keyboard users.
 */
export default function Tip({
  content,
  children,
  className = "",
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom";
}) {
  return (
    <span
      className={`group/tip relative inline-flex outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded ${className}`}
      tabIndex={0}
    >
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-30 w-max max-w-[min(16rem,80vw)] -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium leading-snug text-white hidden shadow-lg group-hover/tip:block group-focus-visible/tip:block ${
          side === "top" ? "bottom-full mb-2" : "top-full mt-2"
        }`}
      >
        {content}
      </span>
    </span>
  );
}
