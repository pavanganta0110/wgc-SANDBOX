import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/monitoring/sentryRedaction";

// Server-side (Node.js runtime) Sentry init — imported by src/instrumentation.ts's
// register() only when NEXT_RUNTIME === "nodejs". Covers API routes, server
// components, server actions, cron routes, and webhook handlers.
//
// SENTRY_DSN is intentionally allowed to be unset: Sentry.init with an empty
// dsn is a documented no-op (nothing is sent, no error thrown), so this app
// runs identically with or without a configured Sentry project until one is
// wired up — see .env.example for the full list of Sentry env vars.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  // Vercel auto-populates the deploy's commit SHA — using it as the release
  // means every captured error already points at an exact deployment
  // without any extra CI step to set SENTRY_RELEASE manually.
  release: process.env.VERCEL_GIT_COMMIT_SHA,

  // Conservative to start — Phase 1's goal is error capture, not full APM.
  // Phase 7 (performance monitoring) can raise this once there's a real
  // reason to pay for denser trace sampling.
  tracesSampleRate: 0.1,

  // Last-line scrubbing before anything leaves the app — see
  // sentryRedaction.ts's own doc comment for what this strips beyond
  // Sentry's own default PII scrubbing (which is already on by default).
  beforeSend: scrubSentryEvent,

  // Don't spam Sentry's own console output in local dev; do want it in
  // preview/production if something's misconfigured (e.g. bad DSN).
  debug: false,
});
