import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizePhone } from "@/lib/donors/donorContact";

/**
 * Resolves (never duplicates) a Donor for a Finix identity, matching in
 * priority order:
 *   1. Existing donor already linked to this exact finixIdentityId
 *   2. Existing donor in this organization with the same normalized email
 *      or phone — the same person giving through a second Finix identity
 *      (e.g. a new card) must not become a second Donor row
 *   3. Otherwise create a new donor from the identity's own fields
 *
 * When the donor already exists (via either match), we NEVER overwrite
 * name/email/phone — those come from the giving form and are the source of
 * truth. Finix's identity entity fields are only used when creating a
 * brand-new donor record (i.e. a webhook arrived for an identity we haven't
 * seen through the giving flow and no matching donor exists by contact
 * info either). If the identity match (1) found a donor missing an
 * finixIdentityId link that this call now has confirmed, or if the
 * email/phone match (2) found a donor with no finixIdentityId yet, this
 * function backfills that link without touching any other field.
 */
export async function upsertDonorFromIdentity(
  finixIdentityId: string,
  churchId: string
): Promise<string | null> {
  if (!finixIdentityId || !churchId) return null;

  const existingByIdentity = await prisma.donor.findUnique({ where: { finixIdentityId } });
  if (existingByIdentity) {
    return existingByIdentity.id;
  }

  let identity: any;
  try {
    identity = await finixClient.getIdentity(finixIdentityId);
  } catch (err) {
    console.error("Failed to fetch Finix identity for donor sync:", err);
    return null;
  }

  const entity = identity?.entity ?? {};
  const name =
    entity.first_name || entity.last_name
      ? `${entity.first_name ?? ""} ${entity.last_name ?? ""}`.trim()
      : entity.business_name ?? null;
  const email = entity.email ?? null;
  const phone = entity.phone ?? null;
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);

  // Same person, a different Finix identity (e.g. a second card) — match by
  // contact info within this organization before creating a duplicate donor.
  if (normalizedEmail || normalizedPhone) {
    const existingByContact = await prisma.donor.findFirst({
      where: {
        churchId,
        archivedAt: null,
        OR: [
          ...(normalizedEmail ? [{ normalizedEmail }] : []),
          ...(normalizedPhone ? [{ normalizedPhone }] : []),
        ],
      },
    });
    if (existingByContact) {
      if (!existingByContact.finixIdentityId) {
        await prisma.donor.update({ where: { id: existingByContact.id }, data: { finixIdentityId } });
      }
      return existingByContact.id;
    }
  }

  const donor = await prisma.donor.create({
    data: {
      churchId,
      finixIdentityId,
      name,
      email,
      normalizedEmail,
      phone,
      normalizedPhone,
    },
  });

  return donor.id;
}
