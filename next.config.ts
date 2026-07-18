import type { NextConfig } from "next";

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
      "script-src 'self' 'unsafe-inline' https://js.finix.com https://pay.google.com https://applepay.cdn-apple.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      // pay.google.com: Google Pay's client makes XHR calls to its own
      // origin during isReadyToPay/loadPaymentData.
      "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://pay.google.com",
      // Google Pay's payment sheet renders inside an iframe from pay.google.com.
      // js.finix.com: the Finix card-tokenization form itself is mounted as
      // an iframe (application/index.html) — adding an explicit frame-src
      // above for Google Pay without also listing this domain silently
      // broke card payments (frame-src has no "inherit the rest from
      // script-src" behavior; an explicit frame-src fully replaces the
      // default-src fallback for iframes, so every framed origin needs its
      // own entry here).
      "frame-src 'self' https://pay.google.com https://js.finix.com",
      // Prevent this page from being embedded anywhere
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
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
              "script-src 'self' 'unsafe-inline' https://js.finix.com https://pay.google.com https://applepay.cdn-apple.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://pay.google.com",
              "frame-src 'self' https://pay.google.com https://js.finix.com",
              "frame-ancestors *",
            ].join("; "),
          },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
