"use client";

import { useEffect, useRef, useState } from "react";

/** Measures the container so charts render at real pixel size (crisp,
 * readable text) instead of scaling a fixed viewBox down on phones. */
export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
