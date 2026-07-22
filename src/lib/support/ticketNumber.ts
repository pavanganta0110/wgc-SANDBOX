import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

function isUniqueConstraintError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}

const MAX_ATTEMPTS = 5;

/**
 * Creates a SupportTicket with a unique "WGC-1001" style ticketNumber,
 * safe under concurrent creation. There's no dedicated counter table —
 * each attempt derives a candidate number from the current ticket count
 * and retries on a unique-constraint collision (ticketNumber is
 * @unique), the same safe-concurrency pattern already used elsewhere in
 * this codebase (see resolveOrCreateDonor's P2002 retry). Bounded to a
 * few attempts — a real collision storm this small would indicate
 * something else is wrong.
 */
export async function createSupportTicketWithNumber(
  data: Omit<Prisma.SupportTicketUncheckedCreateInput, "ticketNumber">
) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const existing = await prisma.supportTicket.count();
    const ticketNumber = `WGC-${1001 + existing + attempt}`;
    try {
      return await prisma.supportTicket.create({ data: { ...data, ticketNumber } });
    } catch (err) {
      if (isUniqueConstraintError(err) && attempt < MAX_ATTEMPTS - 1) continue;
      throw err;
    }
  }
  throw new Error("Failed to generate a unique ticket number");
}
