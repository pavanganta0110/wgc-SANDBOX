# Next.js Security Hardening Guide

## Security Headers (`next.config.ts`)

Add the following headers in your `next.config.ts`:

```ts
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.finix.com",  // tighten further with nonces
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://finix.live-payments-api.com https://finix.sandbox-payments-api.com",
      "frame-ancestors 'none'",
    ].join('; ')
  }
];
```

## Environment Variables
- Never prefix server-only secrets with `NEXT_PUBLIC_` — they get bundled into the client
- Current safe `NEXT_PUBLIC_` vars: `FINIX_APPLICATION_ID`, `FINIX_ENV`, URLs
- Keep `FINIX_USERNAME`, `FINIX_PASSWORD`, `DATABASE_URL`, `RESEND_API_KEY` server-only

## API Route Security
- Use `headers()` from `next/headers` to read request headers server-side
- Validate `Content-Type` on POST routes
- Return generic errors to clients — log full details server-side only

## Middleware (`src/middleware.ts`)
- Ensure matcher covers all protected routes
- Current matcher: `['/admin/:path*', '/api/admin/:path*', '/api/test/:path*']`
- Consider adding rate limiting in middleware using Vercel KV or Upstash Redis

## Server Components vs Client Components
- Never import server-only modules (`prisma`, `finixClient`) in client components
- Use `server-only` package to enforce this at build time:
  ```ts
  import 'server-only'; // Add to lib/finix/client.ts, lib/prisma.ts
  ```

## Webhook Security
- Verify HMAC signatures on all incoming webhooks before processing
- Use constant-time comparison (`crypto.timingSafeEqual`) to prevent timing attacks
- Reject requests without valid signatures with 401 immediately

## Rate Limiting Recommendations
For production, add rate limiting to:
- `POST /api/onboarding` — max 3 per IP per hour
- `POST /api/contact` — max 5 per IP per hour  
- All auth endpoints — max 10 per IP per 15 minutes

Use Vercel KV + `@upstash/ratelimit` for serverless-compatible rate limiting.
