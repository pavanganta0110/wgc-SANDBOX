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
      // Finix.js tokenization lib + inline scripts needed by Next.js hydration + Google reCAPTCHA.
      // pay.google.com: Google Pay JS API (pay.js). applepay.cdn-apple.com: Apple's official
      // <apple-pay-button> web component. cdn.sift.com: Finix's own fraud-detection SDK
      // (Finix.Auth), loaded by finix.js for every donation, wallet or card — without it the
      // fraud_session_id every charge requires can never be generated.
      "script-src 'self' 'unsafe-inline' https://js.finix.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://pay.google.com https://applepay.cdn-apple.com https://cdn.sift.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      // pay.google.com: Google Pay's client makes XHR calls to its own origin during
      // isReadyToPay/loadPaymentData. cdn.sift.com: Finix's fraud SDK reports back to its own origin.
      "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://pay.google.com https://cdn.sift.com",
      // Allow Google reCAPTCHA iframes, Google Pay's payment-sheet iframe, and the
      // Finix card-tokenization iframe (application/index.html) — an explicit frame-src
      // fully replaces the default-src fallback for framed content, so every framed
      // origin needs its own entry here, not just the ones being newly added.
      "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://pay.google.com https://js.finix.com",
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
        // /embed/* must be iframe-able... except Finix's own tokenization
        // SDK refuses to mount inside any iframe at all (confirmed by
        // testing), so this route is only ever opened as a top-level
        // popup window, never actually nested — this override exists so
        // that path stays available if a future Finix SDK update lifts
        // the iframe restriction. Per-org domain restriction (when an
        // admin opts in) is enforced at the application layer instead
        // (see src/lib/giving/embedDomainCheck.ts), since Next's
        // headers() here is static and can't vary per-org. Next merges
        // header entries by key in array order, so this later, more
        // specific match overrides X-Frame-Options/CSP for this path.
        source: "/embed/:path*",
        headers: [
          { key: "X-Frame-Options", value: "" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // /embed/[slug] renders the same GivingLinkForm as /g/[slug] — including its
              // own Google/Apple Pay buttons and Finix card iframe — so it needs the
              // identical wallet allowances as the main CSP block above.
              "script-src 'self' 'unsafe-inline' https://js.finix.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://pay.google.com https://applepay.cdn-apple.com https://cdn.sift.com",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "font-src 'self' https://fonts.gstatic.com",
              "img-src 'self' data: https:",
              "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com https://pay.google.com https://cdn.sift.com",
              "frame-src 'self' https://www.google.com/recaptcha/ https://recaptcha.google.com/recaptcha/ https://pay.google.com https://js.finix.com",
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
