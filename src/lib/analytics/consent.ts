/**
 * Cookie/analytics consent state for the Meta Pixel — opt-in by design
 * (the pixel does not load at all until consent is explicitly granted),
 * which is the safer default across GDPR (requires opt-in) and CCPA
 * (requires opt-out) rather than trying to geo-detect which regime
 * applies to a given visitor.
 *
 * Never touches `window`/localStorage at import time — every function
 * checks for a browser environment first — safe to import from server
 * components or any code that also runs during SSR.
 */

export type ConsentState = "granted" | "denied";

const STORAGE_KEY = "wgc_analytics_consent";

/** Dispatched on `window` whenever consent changes, so MetaPixel.tsx can
 * react immediately (load or unload the pixel) without a page reload. */
export const CONSENT_CHANGE_EVENT = "wgc-analytics-consent-change";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** `null` means the visitor hasn't decided yet — show the banner. */
export function getStoredConsent(): ConsentState | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === "granted" || raw === "denied" ? raw : null;
  } catch {
    // localStorage can throw in some locked-down browser contexts (private
    // mode, disabled storage) — treat as "not decided" rather than crash.
    return null;
  }
}

export function setStoredConsent(state: ConsentState): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, state);
  } catch {
    // Storage write failed (quota, locked-down context) — the in-memory
    // event dispatch below still lets the current page session react;
    // the banner will just reappear on the next page load, which is a
    // safe failure mode (never silently assumes consent was saved).
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: state }));
}
