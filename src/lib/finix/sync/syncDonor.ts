import { finixClient } from "@/lib/finix/client";
import { prisma } from "@/lib/prisma";

/**
 * Upserts a Donor from a Finix identity. When the donor already exists in
 * our DB, we NEVER overwrite name/email/phone — those come from the giving
 * form and are the source of truth. Finix's identity entity fields are only
 * used as a fallback when creating a brand-new donor record (i.e. a webhook
 * arrived for an identity we haven't seen through the giving flow).
 */
export async function upsertDonorFromIdentity(
  finixIdentityId: string,
  churchId: string
): Promise<string | null> {
  if (!finixIdentityId || !churchId) return null;

  const existing = await prisma.donor.findUnique({ where: { finixIdentityId } });

  if (existing) {
    return existing.id;
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

  const donor = await prisma.donor.create({
    data: {
      churchId,
      finixIdentityId,
      name,
      email,
      phone,
    },
  });

  return donor.id;
}
