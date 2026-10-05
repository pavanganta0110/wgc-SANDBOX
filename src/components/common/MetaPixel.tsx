"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { getMetaPixelId, pageView } from "@/lib/analytics/metaPixel";
import { getStoredConsent, CONSENT_CHANGE_EVENT, type ConsentState } from "@/lib/analytics/consent";

// Re-exported for existing call sites (src/components/giving/GivingLinkForm.tsx)
// that import trackMetaEvent from this module path. New code should import
// trackEvent / trackCustomEvent directly from "@/lib/analytics/metaPixel".
export { trackMetaEvent } from "@/lib/analytics/metaPixel";

/**
 * Public marketing surface only. Never track authenticated merchant/admin
 * dashboard activity, or content rendered inside third-party embeds, to Meta.
 */
const EXCLUDED_PATH_PREFIXES = ["/merchant", "/admin", "/embed"];

function isExcludedPath(pathname: string): boolean {
  return EXCLUDED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

/**
 * Fires a PageView on every client-side route change. Skips the very first
 * render — the bootstrap script below already fires the initial PageView —
 * so page loads never produce two PageView events for the same view.
 */
function MetaPixelPageviewTracker() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    pageView();
  }, [pathname]);

  return null;
}

export default function MetaPixel() {
  const pixelId = getMetaPixelId();
  const pathname = usePathname();
  // Starts as "denied" (not "unknown") for the very first server-rendered
  // pass — localStorage isn't available during SSR, and the pixel must
  // never load before consent is confirmed on the client. The effect
  // below immediately corrects this from the actual stored value once
  // mounted, and listens for CONSENT_CHANGE_EVENT so accepting the
  // CookieConsentBanner loads the pixel right away, no reload needed.
  const [consent, setConsent] = useState<ConsentState | "denied">("denied");

  useEffect(() => {
    setConsent(getStoredConsent() ?? "denied");
    const onChange = (e: Event) => setConsent((e as CustomEvent<ConsentState>).detail);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
  }, []);

  if (!pixelId || isExcludedPath(pathname) || consent !== "granted") {
    return null;
  }

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${pixelId}');
            fbq('track', 'PageView');
          `,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
      <MetaPixelPageviewTracker />
    </>
  );
}
