"use client";

import { useRef } from "react";
import GivingLinkForm from "@/components/giving/GivingLinkForm";
import type { ResultState } from "@/components/giving/GivingLinkForm";

/**
 * Bridges the embeddable giving page back to the site that opened it, via
 * postMessage to window.opener. This page is opened as a top-level popup
 * window (see public/embed/wgc-giving.js), NOT loaded in an iframe:
 * Finix's own tokenization SDK explicitly refuses to mount inside any
 * iframe, so the actual payment step must run in a true top-level
 * browsing context. No payment logic lives here — it wraps the existing
 * GivingLinkForm unchanged and only observes its result state via the
 * additive onResult prop.
 *
 * Uses "*" as the postMessage target origin since this page doesn't know
 * in advance which third-party site opened it — normal for a widget
 * embedded on arbitrary sites. Real origin validation happens on the
 * *receiving* end — the opener's loader script — which knows the fixed
 * WGC origin and checks event.origin strictly before trusting anything.
 *
 * Never includes card/bank data, credentials, or internal Finix/merchant
 * IDs in any message. A successful-donation message carries only a
 * reference generated locally in this component (not a raw Finix
 * transfer/subscription id) as the "safe public reference".
 */
export default function EmbedBridge(props: React.ComponentProps<typeof GivingLinkForm>) {
  const referenceRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `wgc-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  function handleResult(result: ResultState) {
    if ((result.step === "success" || result.step === "pending") && window.opener) {
      window.opener.postMessage(
        {
          source: "wgc-giving",
          type: "WGC_PAYMENT_COMPLETED",
          reference: referenceRef.current,
          recurring: result.step === "success" ? Boolean(result.recurring) : false,
          pending: result.step === "pending",
        },
        "*"
      );
    }
    props.onResult?.(result);
  }

  return <GivingLinkForm {...props} onResult={handleResult} />;
}
