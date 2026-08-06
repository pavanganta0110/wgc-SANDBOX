/**
 * Meta Pixel client-side tracking helpers.
 *
 * This module never touches `window` at import time — every function checks
 * for a browser environment first — so it's safe to import from server
 * components, route handlers, or any code that also runs during SSR.
 *
 * Standard Meta conversion events (Lead, CompleteRegistration, Schedule,
 * Contact, ...) should go through `trackEvent`. Anything that isn't one of
 * Meta's standard event names should go through `trackCustomEvent` instead —
 * mixing the two up means the event won't be usable for ad optimization on
 * Meta's side even though it still shows up in Events Manager.
 */

export type FbqParams = Record<string, string | number | boolean | null | undefined>;

type FbqEventOptions = { eventID?: string };

type Fbq = {
  (command: "init", pixelId: string): void;
  (command: "track", eventName: string, params?: FbqParams, options?: FbqEventOptions): void;
  (command: "trackCustom", eventName: string, params?: FbqParams, options?: FbqEventOptions): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: Fbq;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

/**
 * Param keys that must never be sent to Meta, matched (case-insensitively,
 * separators stripped) against every key in an event's params object. This
 * is a defense-in-depth backstop, not a substitute for reviewing call sites
 * — see docs/meta-pixel.md.
 *
 * "name" alone is deliberately NOT a blanket substring match here — that
 * would also catch legitimate safe keys like `content_name`, `cta_name`, and
 * `page_name` (all explicitly listed as safe metadata). Instead, bare "name"
 * and any "<personal-prefix>name" combination is blocked specifically.
 */
const BLOCKED_KEY_SUBSTRINGS = [
  "email",
  "phone",
  "message",
  "address",
  "ssn",
  "socialsecurity",
  "dob",
  "birth",
  "password",
  "secret",
  "token",
  "card",
  "accountnumber",
  "routingnumber",
  "donor",
  "payment",
];

const PERSONAL_NAME_PREFIXES = [
  "first",
  "last",
  "full",
  "middle",
  "donor",
  "customer",
  "contact",
  "user",
  "client",
  "guest",
  "applicant",
  "payer",
  "payee",
  "cardholder",
  "accountholder",
  "sender",
  "recipient",
  "guardian",
  "parent",
  "spouse",
  "patient",
  "member",
  "billing",
  "shipping",
];

function isBlockedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "name") return true;
  if (BLOCKED_KEY_SUBSTRINGS.some((s) => normalized.includes(s))) return true;
  if (PERSONAL_NAME_PREFIXES.some((prefix) => normalized === `${prefix}name`)) return true;
  return false;
}

function sanitizeParams(params?: FbqParams): FbqParams | undefined {
  if (!params) return undefined;
  const safe: FbqParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (isBlockedKey(key)) {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`[MetaPixel] Dropped potentially sensitive param "${key}" before sending to Meta.`);
      }
      continue;
    }
    safe[key] = value;
  }
  return safe;
}

function getFbq(): Fbq | undefined {
  if (typeof window === "undefined") return undefined;
  return typeof window.fbq === "function" ? window.fbq : undefined;
}

/** The configured pixel ID, or `undefined` if tracking is disabled. */
export function getMetaPixelId(): string | undefined {
  return process.env.NEXT_PUBLIC_META_PIXEL_ID || undefined;
}

/** Whether the pixel has actually loaded and `fbq` is callable right now. */
export function isMetaPixelEnabled(): boolean {
  return getFbq() !== undefined;
}

/**
 * Fires a PageView. The initial page load's PageView is fired once by the
 * pixel bootstrap script itself (see MetaPixel.tsx) — call this only for
 * subsequent client-side route changes in the SPA, so PageView never double-fires.
 */
export function pageView(): void {
  const fbq = getFbq();
  if (!fbq) return;
  fbq("track", "PageView");
}

/**
 * Fires a standard Meta conversion event (e.g. "Lead", "CompleteRegistration",
 * "Schedule", "Contact"). Only call this after the underlying action has
 * actually succeeded — never on form open/start.
 *
 * `params` should only carry safe event metadata (page name, CTA name, form
 * type, campaign identifier, content category) — never PII. Known-sensitive
 * keys are stripped automatically as a backstop.
 *
 * `eventId` is optional and, if provided, is passed through as Meta's
 * `eventID` so a future server-side Conversions API event sharing the same
 * ID can be deduplicated against this browser-side event.
 */
export function trackEvent(eventName: string, params?: FbqParams, eventId?: string): void {
  const fbq = getFbq();
  if (!fbq) return;
  fbq("track", eventName, sanitizeParams(params), eventId ? { eventID: eventId } : undefined);
}

/**
 * Fires a custom (non-standard) Meta event for a site-specific action that
 * doesn't map to one of Meta's standard event names. Same rules as
 * `trackEvent` apply: only fire after success, never send PII.
 */
export function trackCustomEvent(eventName: string, params?: FbqParams, eventId?: string): void {
  const fbq = getFbq();
  if (!fbq) return;
  fbq("trackCustom", eventName, sanitizeParams(params), eventId ? { eventID: eventId } : undefined);
}

/**
 * @deprecated Use `trackCustomEvent` for new call sites. Kept only so
 * src/components/giving/GivingLinkForm.tsx — pre-existing, privacy-reviewed
 * donor-flow UX telemetry that is out of scope for this change — keeps
 * working unmodified.
 */
export const trackMetaEvent = trackCustomEvent;
