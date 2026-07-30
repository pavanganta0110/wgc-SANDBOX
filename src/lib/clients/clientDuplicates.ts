import { prisma } from "@/lib/prisma";

export interface PossibleDuplicateClient {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  organizationName: string | null;
  matchedOn: ("email" | "phone" | "organizationName")[];
}

/**
 * Duplicate detection is a soft warning only — never an automatic merge or
 * a hard block on save, per the approved spec ("Do not automatically merge
 * clients. Show a duplicate warning and require an authorized user to
 * decide."). Matches on normalized email, normalized phone, or an exact
 * (case-insensitive) organization name, scoped to the same church and
 * excluding archived clients and (on an edit) the client being edited.
 */
export async function findPossibleDuplicateClients(
  churchId: string,
  input: { normalizedEmail?: string | null; normalizedPhone?: string | null; organizationName?: string | null },
  excludeClientId?: string
): Promise<PossibleDuplicateClient[]> {
  const orConditions: Array<Record<string, unknown>> = [];
  if (input.normalizedEmail) orConditions.push({ normalizedEmail: input.normalizedEmail });
  if (input.normalizedPhone) orConditions.push({ normalizedPhone: input.normalizedPhone });
  if (input.organizationName?.trim()) {
    orConditions.push({ organizationName: { equals: input.organizationName.trim(), mode: "insensitive" } });
  }
  if (orConditions.length === 0) return [];

  const candidates = await prisma.client.findMany({
    where: {
      churchId,
      archivedAt: null,
      ...(excludeClientId ? { id: { not: excludeClientId } } : {}),
      OR: orConditions,
    },
    select: { id: true, displayName: true, email: true, normalizedEmail: true, phone: true, normalizedPhone: true, organizationName: true },
    take: 10,
  });

  return candidates.map((c) => {
    const matchedOn: PossibleDuplicateClient["matchedOn"] = [];
    if (input.normalizedEmail && c.normalizedEmail === input.normalizedEmail) matchedOn.push("email");
    if (input.normalizedPhone && c.normalizedPhone === input.normalizedPhone) matchedOn.push("phone");
    if (input.organizationName?.trim() && c.organizationName?.trim().toLowerCase() === input.organizationName.trim().toLowerCase()) {
      matchedOn.push("organizationName");
    }
    return { id: c.id, displayName: c.displayName, email: c.email, phone: c.phone, organizationName: c.organizationName, matchedOn };
  });
}
