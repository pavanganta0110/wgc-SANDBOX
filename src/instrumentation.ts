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
    // Phase 3: wires Prisma's "error" event into System Health's Supabase
    // service card — see databaseHealth.ts's own doc comment for why this
    // is registered here rather than inside prisma.ts itself (circular
    // import avoidance).
    const { registerDatabaseHealthListener } = await import("./lib/monitoring/databaseHealth");
    registerDatabaseHealthListener();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors thrown during server-side rendering that Next.js's own
// error handling swallows before a normal try/catch in application code
// would ever see them (e.g. a React Server Component render error).
//
// This is also, deliberately, Phase 2's one real WGC System Health
// producer: every uncaught server-side error, app-wide, already flows
// through this single Next.js hook with zero per-route changes needed —
// exactly the kind of architecture-level (not integration-specific) source
// appropriate for this phase, leaving Finix/Supabase/Resend/Twilio/Aplos/
// webhook/job producers to Phase 3 as planned.
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  errorContext: { routerKind: string; routePath: string; routeType: string }
) {
  Sentry.captureRequestError(error, request, errorContext);

  // recordHealthEvent() imports the Prisma client, which only works in the
  // Node.js runtime — this hook can also fire for Edge routes/middleware,
  // where this must be skipped entirely rather than attempted and failed.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { recordHealthEvent } = await import("./lib/monitoring/healthEvents");
      await recordHealthEvent({
        service: "WGC API",
        operation: errorContext.routeType,
        route: request.path,
        status: "FAILED",
        severity: "ERROR",
        message: error instanceof Error ? error.message : "Unknown server error",
      });
    } catch (recordFailure) {
      console.error("[onRequestError] Failed to record health event:", recordFailure);
    }
  }
}
