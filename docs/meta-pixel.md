# Meta Pixel

## Where it's initialized

- **Component**: [`src/components/common/MetaPixel.tsx`](../src/components/common/MetaPixel.tsx) — a client component rendered once from the root layout: [`src/app/layout.tsx`](../src/app/layout.tsx).
- **Helpers**: [`src/lib/analytics/metaPixel.ts`](../src/lib/analytics/metaPixel.ts) — `getMetaPixelId`, `isMetaPixelEnabled`, `pageView`, `trackEvent`, `trackCustomEvent`. SSR-safe (every function checks `typeof window` before touching it).

The component mounts in the root layout so it's structurally present on every route, but it self-excludes on non-public paths (see "Pages covered" below) and no-ops entirely when the pixel ID isn't configured.

## Pixel ID

`1842736093385081` (WGC's Meta Pixel). Not a secret — Meta Pixel IDs are public by design (they're visible in every page's HTML/network requests) — but it's still supplied via environment variable rather than hardcoded, so it can differ per environment and be rotated without a code change.

## Environment variable

```env
NEXT_PUBLIC_META_PIXEL_ID=1842736093385081
```

- Required in `.env.local` for local development, and in the corresponding Vercel project's environment variables for preview/production (see "Deployment steps" below — **not set in Vercel yet**, that's a deployment action requiring approval).
- **If unset**: `MetaPixel` renders nothing (no `<Script>`, no `<noscript>`), `isMetaPixelEnabled()` returns `false`, and `pageView`/`trackEvent`/`trackCustomEvent` silently no-op. The rest of the site is unaffected — verified locally by running the dev server with the variable removed (see Testing section).

## Pages covered

The pixel is scoped to the **public marketing surface** of the site — it does *not* fire on:

- `/merchant/*` (authenticated merchant dashboard)
- `/admin/*` (authenticated WGC admin dashboard)
- `/embed/*` (giving pages iframed on third-party sites)

This is enforced in `MetaPixel.tsx` via a pathname check (`EXCLUDED_PATH_PREFIXES`), not via routing structure — the app has a single root layout with no marketing/app route-group split, so excluding by path was the least invasive way to scope this without restructuring the app.

This is a deliberate change from the pixel's prior behavior (which fired unconditionally on every route, including the authenticated dashboards) — flagged in the PR/report as something to be aware of, not something requiring separate approval, since "every public page" (not internal dashboards) is what was asked for.

Everywhere else — `/first-look`, `/first-look/confirmed`, `/`, `/pricing`, `/resources`, `/start`, `/software-partners`, `/developers`, `/demo/*`, etc. — gets the pixel.

## Events currently tracked

| Event | Type | Trigger | File |
|---|---|---|---|
| `PageView` | Standard | Once on initial page load (bootstrap script), then once per client-side route change | `MetaPixel.tsx` |
| `Lead` | Standard | First Look registration form submits successfully (`POST /api/first-look/register` returns `{ success: true }`) | `src/components/marketing/FirstLookForm.tsx` |
| `BuildUpdatesOptIn` | Custom | Visitor opts in to weekly build-update emails on the confirmation page, and the preference save succeeds (`POST /api/first-look/preferences` returns `{ success: true }`) | `src/components/marketing/FirstLookPreferencesForm.tsx` |
| `MailingAddressSectionDisplayed` / `...Opened` / `...Completed` | Custom | Pre-existing donor-flow UX telemetry on the giving page (unchanged by this work — see "Out of scope" below) | `src/components/giving/GivingLinkForm.tsx` |

All events fire **only after the underlying action succeeds** — never on form open, and never speculatively. `Lead` and `BuildUpdatesOptIn` both gate on the API response's `success: true`, matching the existing pattern already used for redirect/UI-state decisions in those components.

### Why no `CompleteRegistration`, `Schedule`, or `Contact` events

The site was reviewed for these and none apply today:
- No separate "registration complete" step exists beyond the Lead form itself.
- No meeting-booking/scheduling widget exists in the codebase (confirmed by search — no Calendly integration, no booking API). The header's "Schedule a Call" link and the hero's "Save my seat" button are just anchor links (`#join`) to the same lead form.
- No standalone "Contact" flow exists on First Look distinct from the lead form.

Per the requirement to not invent tracking for actions that don't exist, none of these were added. If a scheduling flow or separate contact form is built later, see "How to add future events" below.

## Consent behavior

**No cookie/consent banner or consent-gating system exists anywhere in this codebase** (verified by full-codebase search). This was true before this change and remains true after it — this work did not add or remove any consent mechanism.

This means the pixel fires unconditionally for all visitors, in all jurisdictions, once `NEXT_PUBLIC_META_PIXEL_ID` is set in an environment. This is called out explicitly in the final report as something requiring a business/legal decision, not something resolved as part of this implementation — building a consent management platform is a separate, larger scope than "add the pixel," and false Positive/negative consent logic invented without a legal reviewer's input would be worse than clearly flagging the gap.

If a consent gate is added later, the natural integration point is `MetaPixel.tsx`: wrap the early-return check with a call into whatever consent state the future banner exposes (e.g. `if (!pixelId || isExcludedPath(pathname) || !hasMarketingConsent()) return null;`), and gate `pageView`/`trackEvent`/`trackCustomEvent` in `metaPixel.ts` the same way.

## How to verify the pixel

**Locally:**
1. Ensure `.env.local` has `NEXT_PUBLIC_META_PIXEL_ID="1842736093385081"`.
2. `npm run dev`, visit `http://localhost:3000/first-look`.
3. Open DevTools → Console and run `window.fbq` — should be a function, not `undefined`.
4. Open DevTools → Network, filter `facebook`, reload — you should see a request to `connect.facebook.net/.../fbevents.js` and a subsequent `connect.facebook.net/signals/config/1842736093385081...` request.
5. Click an internal nav link (e.g. Home → Pricing) and confirm no full page reload occurs, then check that exactly one additional PageView fired (see "How this was tested" below for a scriptable way to do this).

**Via Meta's own tools (once the pixel is live on a real deployed URL with the env var set):**
- **Meta Pixel Helper** (Chrome extension) — install it, visit the live page, and it will show the pixel ID, firing status, and any errors directly in the browser toolbar.
- **Meta Events Manager → Test Events** (business.facebook.com → Events Manager → your pixel → Test Events tab) — enter the live URL, browse the site in the panel it opens, and watch PageView/Lead/BuildUpdatesOptIn events arrive in real time with their exact parameters. This is also the fastest way to confirm production is receiving events after deployment.

## How to disable tracking

Remove or unset `NEXT_PUBLIC_META_PIXEL_ID` in the relevant environment (Vercel project settings, or `.env.local`) and redeploy/restart. No code change needed — the component and every helper function already treat a missing pixel ID as "tracking off."

## How to add future events

1. Decide if it's a **standard** Meta event (`Lead`, `CompleteRegistration`, `Schedule`, `Contact`, `Purchase`, etc. — see [Meta's standard events list](https://www.facebook.com/business/help/402791146561655)) or a **custom** one.
2. Import the right helper from `@/lib/analytics/metaPixel`: `trackEvent` for standard, `trackCustomEvent` for custom.
3. Call it **only** after the action succeeds (check the API response, not just form submission).
4. Only pass safe metadata as params — page name, CTA name, form type, campaign identifier, content category. Never email, phone, full name, form message text, donor data, or payment data. As a backstop, `sanitizeParams` in `metaPixel.ts` strips any param whose key looks like PII before it reaches `fbq` (and logs a dev-only console warning when it does) — but that's a safety net, not a substitute for choosing safe param keys in the first place.
5. If the same action might later also fire a server-side Conversions API event, generate a `crypto.randomUUID()` client-side and pass it as the third argument (`eventId`) to `trackEvent`/`trackCustomEvent`, mirroring how `FirstLookForm.tsx` does it for `Lead` — this lets Meta deduplicate the browser and server events sharing that ID.

## Out of scope / left untouched

- **`src/components/giving/GivingLinkForm.tsx`** — the actual donation/giving form fires three pre-existing custom events (`MailingAddressSectionDisplayed/Opened/Completed`) via a `trackMetaEvent` helper, already privacy-reviewed in that file's own comments ("never the donor's actual street address..."). This is donor-flow tracking, explicitly out of scope for this change ("do not modify payment or donor tracking"). `trackMetaEvent` is kept as a deprecated alias for `trackCustomEvent` in `src/lib/analytics/metaPixel.ts` specifically so this file keeps working unmodified.
- **Server-side Conversions API** — the `FirstLookLead` Prisma model already has `metaEventId`/`metaBrowserEventRecordedAt` fields reserved for this, but no server-side CAPI call exists yet. Not built as part of this change (not requested, and a meaningfully larger scope involving a Meta access token and server-to-server calls).

## Deployment / CSP changes required

- **CSP** (`next.config.ts`, sitewide `securityHeaders` block only — the `/embed/*` block is untouched since the pixel is excluded there):
  - `script-src`: added `https://connect.facebook.net` (loads `fbevents.js`).
  - `connect-src`: added `https://connect.facebook.net` and `https://www.facebook.com` (the pixel's own beacon calls and its `signals/config` request).
  - `img-src` already allowed `https:` broadly, so the `<noscript>` fallback `<img>` needed no CSP change.
- **Environment variable**: `NEXT_PUBLIC_META_PIXEL_ID=1842736093385081` needs to be added to the Vercel project's environment variables (sandbox and/or production, per your call) before the pixel will do anything in a deployed environment — it's currently only in local `.env.local`, which is gitignored and never deployed.
