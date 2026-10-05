"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoredConsent, CONSENT_CHANGE_EVENT, type ConsentState } from "@/lib/analytics/consent";

const SIMPLIFI_TAG_ID = "2be2d93c-ab3d-4d24-be16-2f8803014632";

/**
 * Public marketing surface only, same rule as MetaPixel — never load on
 * authenticated merchant/admin dashboard activity or inside third-party
 * embeds.
 */
const EXCLUDED_PATH_PREFIXES = ["/merchant", "/admin", "/embed"];

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Simpli.fi site-retargeting pixel. Gated behind the same shared
 * wgc_analytics_consent state as MetaPixel — one consent decision covers
 * every tracking pixel on the site, not a separate banner per vendor.
 */
export default function SimplifiPixel() {
  const pathname = usePathname();
  const [consent, setConsent] = useState<ConsentState | "denied">("denied");

  useEffect(() => {
    setConsent(getStoredConsent() ?? "denied");
    const onChange = (e: Event) => setConsent((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (isExcludedPath(pathname) || consent !== "granted") {
    return null;
  }

  return <Script id="simplifi-pixel" async strategy="afterInteractive" src={`https://tag.simpli.fi/sifitag/${SIMPLIFI_TAG_ID}`} />;
}
