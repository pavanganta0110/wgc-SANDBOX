import { prisma } from "@/lib/prisma";

/**
 * A partner opens WGC for an organization with ITS OWN id for it (the `reference`). The frame
 * finds the organization by that id, so when the partner later sends a different id for the same
 * organization, nothing matches and the application form shows again, even after approval.
 *
 * This looks for that case: no organization or application of this partner uses `reference`, but
 * one of this partner's OTHER references has the same contact email or name. Always scoped to the
 * partner, so it never reveals another partner's organizations. Returns the reference the
 * organization is actually registered under, or null when this really is a new organization.
 */
export async function findReferenceMismatch(
  partnerId: string,
  reference: string,
  hints: { emails: Array<string | null | undefined>; organizationName?: string | null }
): Promise<{ existingReference: string } | null> {
  const emails = Array.from(new Set(hints.emails.map((e) => e?.trim().toLowerCase()).filter((e): e is string => Boolean(e))));
  const name = hints.organizationName?.trim();
  if (emails.length === 0 && !name) return null;

  const [sameRefChurch, sameRefApp] = await Promise.all([
    prisma.church.findFirst({ where: { partnerId, partnerReference: reference }, select: { id: true } }),
    prisma.onboardingApplication.findFirst({ where: { partnerId, partnerReference: reference }, select: { id: true } }),
  ]);
  // The reference already resolves to an organization, so there is nothing to correct.
  if (sameRefChurch || sameRefApp) return null;

  const church = await prisma.church.findFirst({
    where: {
      partnerId,
      partnerReference: { not: null },
      OR: [
        ...emails.map((e) => ({ primaryContactEmail: { equals: e, mode: "insensitive" as const } })),
        ...(name ? [{ name: { equals: name, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { partnerReference: true },
  });
  if (church?.partnerReference) return { existingReference: church.partnerReference };

  const app = await prisma.onboardingApplication.findFirst({
    where: {
      partnerId,
      partnerReference: { not: null },
      submittedAt: { not: null },
      OR: [
        ...emails.map((e) => ({ contactEmail: { equals: e, mode: "insensitive" as const } })),
        ...(name ? [{ organizationName: { equals: name, mode: "insensitive" as const } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { partnerReference: true },
  });
  if (app?.partnerReference) return { existingReference: app.partnerReference };
  return null;
}
