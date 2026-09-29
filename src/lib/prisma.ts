import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

// "error" is emitted as both a stdout line (unchanged existing behavior)
// AND a subscribable event — src/lib/monitoring/databaseHealth.ts listens
// for that event to feed real database-health signal into System Health.
// That listener lives in a separate module (not here) specifically to
// avoid a circular import: healthEvents.ts imports `prisma` from this
// file, so this file must never import anything from src/lib/monitoring.
// Prisma requires every entry in the array to use the same {emit,level}
// object form once any one of them does — `as const` preserves the
// literal types $on()'s overloads need to accept "error".
const logConfig: Array<{ emit: "stdout" | "event"; level: "query" | "error" | "warn" | "info" }> =
  process.env.NODE_ENV === "development"
    ? [
        { emit: "stdout", level: "query" },
        { emit: "event", level: "error" },
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "warn" },
      ]
    : [
        { emit: "event", level: "error" },
        { emit: "stdout", level: "error" },
      ];

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: logConfig,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
