import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per runtime at startup. Sentry's own Next.js
// SDK convention (as of the instrumentation-hook-based setup, replacing the
// older three-sentry-config-files pattern) is to conditionally import a
// runtime-specific init file here rather than call Sentry.init() directly —
// keeps Node-only and Edge-only Sentry integrations from ever being
// bundled into the wrong runtime.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown during server-side rendering that Next.js's own
// error handling swallows before a normal try/catch in application code
// would ever see them (e.g. a React Server Component render error).
export const onRequestError = Sentry.captureRequestError;
