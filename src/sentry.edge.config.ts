import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/monitoring/sentryRedaction";

// Edge-runtime Sentry init — imported by src/instrumentation.ts's register()
// only when NEXT_RUNTIME === "edge". Covers Edge API routes and Edge
// middleware (src/middleware.ts runs here, not in Node.js).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  beforeSend: scrubSentryEvent,
  debug: false,
});
