import { prisma } from "@/lib/prisma";
import type { PartnerLedgerOrganization } from "@/lib/ledger/loadLedger";

/**
 * The organizations a partner key may read. `partnerId` must come from the
 * authenticated key. Everything the partner API returns is limited to these.
 */
export async function loadPartnerApiOrganizations(partnerId: string): Promise<PartnerLedgerOrganization[]> {
  const churches = await prisma.church.findMany({
    where: { partnerId },
    select: { id: true, name: true, partnerReference: true },
    orderBy: { name: "asc" },
  });
  return churches.map((c) => ({ id: c.id, name: c.name, reference: c.partnerReference }));
}

/** One of the partner's own organizations, by WGC id or by the partner's reference. Null if it isn't theirs. */
export function pickPartnerOrganization(organizations: PartnerLedgerOrganization[], idOrReference: string): PartnerLedgerOrganization | null {
  return organizations.find((o) => o.id === idOrReference) ?? organizations.find((o) => o.reference !== null && o.reference === idOrReference) ?? null;
}
