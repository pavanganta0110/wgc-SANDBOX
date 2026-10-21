import type { NextConfig } from "next";
// @sentry/nextjs v11 moved withSentryConfig to this subpath export (the root
// package export no longer includes it) — confirmed against this repo's
// installed version's package.json exports map.
import { withSentryConfig } from "@sentry/nextjs/config";

// Next.js's own dev server (Turbopack HMR, React DevTools call-stack
// reconstruction) uses eval() internally — production never does. Scoping
// 'unsafe-eval' to dev only keeps the real, deployed CSP exactly as strict
// as before; this never reaches a real donor's browser.
const scriptSrcEval = process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Finix.js tokenization lib + inline scripts needed by Next.js hydration.
      // pay.google.com serves the Google Pay JS API (pay.js) and applepay.cdn-apple.com
      // serves Apple's official <apple-pay-button> web component — without
      // these, both wallet scripts fail to load and the buttons never
      // appear, regardless of any env var configuration. This was the
      // second (independent) root cause of Google/Apple Pay not showing up,
      // alongside the missing wallet env vars — see loadPublicGivingPageData.ts.
      // cdn.sift.com: Finix's own fraud-detection SDK (Finix.Auth, wraps
      // Sift Science), loaded by finix.js itself to produce fraud_session_id
      // — required for every donation, wallet or card, not wallet-specific.
      // www.google.com/www.gstatic.com: react-google-recaptcha on the /start
      // onboarding application (src/app/start/page.tsx) — recaptcha/api.js
      // is served from google.com, its rendered widget assets from gstatic.com.
      // connect.facebook.net: loads the Meta Pixel's fbevents.js on public
      // marketing pages (see src/components/common/MetaPixel.tsx).
      // tag.simpli.fi: Simpli.fi's site-retargeting pixel (see
      // src/components/common/SimplifiPixel.tsx).
      // *.posthog.com: PostHog (src/instrumentation-client.ts) loads its
      // core bundle plus lazy-loaded extensions (session replay, exception
      // autocapture) from asset subdomains that rotate over time — PostHog's
      // own docs specifically call for a wildcard here rather than pinning
      // exact subdomains. Confirmed necessary the hard way: without this,
      // the script tag still renders and the integration LOOKS complete,
      // but the browser silently blocks every request and zero events ever
      // arrive (posthog-js never throws or logs a CSP violation itself).
      `script-src 'self' 'unsafe-inline'${scriptSrcEval} https://js.finix.com https://pay.google.com https://applepay.cdn-apple.com https://cdn.sift.com https://www.google.com https://www.gstatic.com https://connect.facebook.net https://tag.simpli.fi https://*.posthog.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "media-src 'self' https: http:",
      // pay.google.com: Google Pay's client makes XHR calls to its own
      // origin during isReadyToPay/loadPaymentData.
      // google.com (bare, no pay. subdomain): reproduced live on the /g/[slug]
      // page in mobile viewport — Google Pay's own SDK also connects to
      // https://google.com/pay directly (not just pay.google.com), and that
      // connection was being silently blocked. Plausible contributor to
      // donors on mobile hitting "the secure payment form is not ready
      // yet" (not fully confirmed as the sole cause, but a real, verified
      // CSP violation worth closing regardless).
      // connect.facebook.net / www.facebook.com: the Meta Pixel's own beacon
      // calls (fbq track/trackCustom) and its noscript <img> fallback.
      // tag.simpli.fi: Simpli.fi's own tracking beacon calls.
      // *.posthog.com: event capture, feature flags, and session replay
      // ingestion — same wildcard rationale as script-src above.
      "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://finix.qa-payments-api.com https://pay.google.com https://google.com https://cdn.sift.com https://connect.facebook.net https://www.facebook.com https://tag.simpli.fi https://*.posthog.com",
      // Session replay records via a Web Worker loaded from a blob: URL —
      // without this, worker-src falls back to script-src (no blob:/data:
      // allowance there), so recording silently never starts.
      "worker-src 'self' blob: data:",
      // Google Pay's payment sheet renders inside an iframe from pay.google.com.
      // js.finix.com: the Finix card-tokenization form itself is mounted as
      // an iframe (application/index.html) — adding an explicit frame-src
      // above for Google Pay without also listing this domain silently
      // broke card payments (frame-src has no "inherit the rest from
      // script-src" behavior; an explicit frame-src fully replaces the
      // default-src fallback for iframes, so every framed origin needs its
      // own entry here).
      // www.google.com: the reCAPTCHA challenge widget itself renders in an
      // iframe from here (same reasoning as js.finix.com above).
      // youtube-nocookie.com / player.vimeo.com / tiktok.com / instagram.com /
      // facebook.com: the optional thank-you video on the donation success
      // screen (resolveThankYouVideoEmbed) renders as an iframe from
      // whichever of these platforms the merchant's video URL is from.
      "frame-src 'self' https://pay.google.com https://js.finix.com https://www.google.com https://calendly.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com https://www.instagram.com https://www.facebook.com",
      // Prevent this page from being embedded externally, but allow same-origin iframing for walkthroughs
      "frame-ancestors 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  devIndicators: false,
  async redirects() {
    return [
      { source: "/for-software-partners", destination: "/software-partners", permanent: true },
      { source: "/churches", destination: "/for/churches", permanent: true },
      { source: "/register", destination: "/start", permanent: true },
      // Renamed 2026-09: the promo itself changed from 6 months free to
      // 90 days free. Permanent redirect so existing bookmarked/advertised
      // links to the old URL keep working.
      { source: "/six-months-free", destination: "/90-days-free", permanent: true },
      { source: "/six-months-free/signup", destination: "/90-days-free/signup", permanent: true },
      // Consolidated 2026-09: "Christian Nonprofits" and "Nonprofits" were
      // two separate, overlapping nav tabs/pages — merged into one page at
      // the (already-indexed) /for/christian-nonprofits URL, now covering
      // the full nonprofit audience (including Missions as a section within
      // it). This redirect preserves any existing links/rankings pointing
      // at the retired /for/nonprofits URL.
      { source: "/for/nonprofits", destination: "/for/christian-nonprofits", permanent: true },
    ];
  },
  experimental: {
    // The merchant dashboard shows live financial data (payments,
    // balances, donation totals) — Next's default client router cache
    // (30s for dynamic routes) can show a stale pre-transaction dashboard
    // after a sidebar navigation. Force every dynamic navigation to refetch.
    staleTimes: {
      dynamic: 0,
    },
  },
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // /embed/* must be iframe-able from arbitrary third-party sites —
        // that's the entire point of the website-embed feature. Per-org
        // domain restriction (when an admin opts in) is enforced at the
        // application layer instead (see src/lib/giving/embedDomainCheck.ts),
        // since Next's headers() here is static and can't vary per-org.
        // Next merges header entries by key in array order, so this later,
        // more specific match overrides X-Frame-Options/CSP for this path.
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // /embed/[slug] renders the same GivingLinkForm as /g/[slug] —
              // including its own Google/Apple Pay buttons and Finix card
              // iframe — so it needs the identical wallet allowances as the
              // main CSP block above, kept in sync deliberately rather than
              // shared via a helper since these two blocks already diverge
              // on X-Frame-Options/frame-ancestors for the embed use case.
              // cdn.sift.com: Finix's own fraud-detection SDK, required by finix.js.
              // *.posthog.com: src/instrumentation-client.ts runs on every
              // page including this one — same rationale as the main CSP
              // block above.
              `script-src 'self' 'unsafe-inline'${scriptSrcEval} https://js.finix.com https://pay.google.com https://applepay.cdn-apple.com https://cdn.sift.com https://*.posthog.com`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "media-src 'self' https: http:",
              // google.com (bare, no pay. subdomain): kept in sync with the
              // main CSP block's connect-src above — see that comment.
              "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://finix.qa-payments-api.com https://pay.google.com https://google.com https://cdn.sift.com https://*.posthog.com",
              "worker-src 'self' blob: data:",
              "frame-src 'self' https://pay.google.com https://js.finix.com https://www.youtube-nocookie.com https://player.vimeo.com https://www.tiktok.com https://www.instagram.com https://www.facebook.com",
              "frame-ancestors *",
            ].join("; "),
          },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
};

// withSentryConfig uploads source maps at build time so a production error
// points at real source files/lines instead of minified bundle output —
// safe to wrap unconditionally: without SENTRY_AUTH_TOKEN/SENTRY_ORG/
// SENTRY_PROJECT set, it skips the upload step with a console warning
// rather than failing the build (confirmed Sentry webpack-plugin behavior),
// so this is a no-op until those are configured (see .env.example).
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: true,
});
