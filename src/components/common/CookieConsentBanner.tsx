"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoredConsent, setStoredConsent } from "@/lib/analytics/consent";

/** Same scoping as MetaPixel.tsx — never show this on authenticated
 * merchant/admin dashboard pages or inside third-party embeds; those
 * aren't marketing-tracked surfaces to begin with. */
const EXCLUDED_PATH_PREFIXES = ["/merchant", "/admin", "/embed"];

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function CookieConsentBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only decided on the client (localStorage isn't available during
    // SSR) — starts hidden, then shows itself if the visitor hasn't
    // decided yet, so there's no server/client render mismatch.
    setVisible(getStoredConsent() === null);
  }, []);

  // SimplifiPixel has no "is configured" gate (its tag id is fixed, not
  // env-driven, unlike Meta's) — so this banner is always relevant now,
  // even in an environment with no Meta Pixel ID set.
  if (isExcludedPath(pathname) || !visible) {
    return null;
  }

  const decide = (state: "granted" | "denied") => {
    setStoredConsent(state);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 py-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:px-6"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          We use analytics cookies to understand how visitors use this site. We won't turn these on until you say it's okay.
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => decide("denied")}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => decide("granted")}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
