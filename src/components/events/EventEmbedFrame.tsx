"use client";

import { useEffect, useRef } from "react";

/**
 * Wraps the embedded event page: reports its height to the website it sits
 * on (so the loader can size the iframe with no scrollbar), and for events
 * that take payment, renders the button that opens the secure registration
 * window — Finix's card form can't run inside a frame, so payment always
 * happens in that top-level window.
 */
export function EventEmbedFrame({ slug, children }: { slug: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.parent === window) return;
    let last = 0;
    const report = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      if (height > 0 && height !== last) {
        last = height;
        window.parent.postMessage({ source: "wgc-event", type: "WGC_EVENT_HEIGHT", slug, height }, "*");
      }
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [slug]);

  return <div ref={ref}>{children}</div>;
}

export function RegisterInWindowButton({ slug, label, backgroundColor, color }: { slug: string; label: string; backgroundColor: string; color: string }) {
  function open() {
    const url = `${window.location.origin}/event/${encodeURIComponent(slug)}?embed=1`;
    const w = window.open(url, `wgc-event-${slug}`, "width=560,height=860,scrollbars=yes,resizable=yes");
    if (!w) window.open(url, "_blank", "noopener");
  }
  return (
    <div className="text-center">
      <button type="button" onClick={open} className="w-full py-3 rounded-lg font-semibold text-sm" style={{ backgroundColor, color }}>
        {label}
      </button>
      <p className="text-xs mt-2 opacity-70">Opens a secure window to complete your registration.</p>
    </div>
  );
}
