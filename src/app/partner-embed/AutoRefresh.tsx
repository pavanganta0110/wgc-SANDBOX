"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Checks again every half minute while the frame is waiting on WGC, so approval shows up without a reload. */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
