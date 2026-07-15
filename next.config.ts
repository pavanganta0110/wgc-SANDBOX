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
      // Finix.js tokenization lib + inline scripts needed by Next.js hydration
      "script-src 'self' 'unsafe-inline' https://js.finix.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com",
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
    ];
  },
};

export default nextConfig;
