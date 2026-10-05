import { prisma } from "@/lib/prisma";
import { recordHealthEvent } from "./healthEvents";

/**
 * Wires Prisma's own "error" event (connection failures, query timeouts,
 * unexpected exceptions — configured as an emittable event in
 * src/lib/prisma.ts) into System Health as a real "Supabase" service
 * signal. Lives in its own module, not in src/lib/prisma.ts itself, to
 * avoid a circular import: healthEvents.ts imports the `prisma` client, so
 * prisma.ts can never import anything from src/lib/monitoring.
 *
 * Passive and zero-overhead by design: this reacts to errors the app was
 * already going to encounter during real request handling — it never runs
 * an extra query itself ("do not run expensive queries as health checks").
 * A single isolated error is still meaningful history (recorded as one
 * SystemHealthEvent), but serviceStatus.ts's supabaseStatus() only escalates
 * the service card to Degraded/Outage once several land in the same short
 * window — see thresholds.ts's DB_DEGRADED_FAILURE_COUNT/DB_CRITICAL_FAILURE_COUNT.
 *
 * Called once at startup from src/instrumentation.ts's register() (Node
 * runtime only — this uses the Prisma client, which doesn't run on Edge).
 */
let registered = false;

// Prisma's typed $on('error', ...) overload requires the client's `log`
// config to be visible at its exact construction site as a literal tuple
// type; going through the global-singleton pattern in src/lib/prisma.ts
// (`globalForPrisma.prisma ?? new PrismaClient(...)`, needed for Next.js
// dev-mode hot-reload) widens that away, so $on's return type resolves to
// `never` for a config it can plainly emit at runtime — a well-known
// Prisma+TypeScript friction point with this pattern, not a real type
// error. The cast below is scoped to this one call, not the whole client.
type PrismaWithErrorEvent = { $on(event: "error", callback: (event: { message: string; target?: string; timestamp?: Date }) => void): void };

export function registerDatabaseHealthListener(): void {
  if (registered) return;
  registered = true;

  (prisma as unknown as PrismaWithErrorEvent).$on("error", (event) => {
    // Never await, never let a failure here propagate — this handler runs
    // inside Prisma's own event emission; throwing here must not affect
    // the query that triggered it.
    void recordHealthEvent({
      service: "Supabase",
      operation: event.target,
      status: "FAILED",
      severity: "ERROR",
      message: event.message || "Prisma reported a database error",
      metadata: { target: event.target },
    }).catch((err) => {
      console.error("[registerDatabaseHealthListener] failed to record health event:", err);
    });
  });
}
