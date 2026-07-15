import { prisma } from "@/lib/prisma";

export async function loadOrganizationProfile(churchId: string) {
  const church = await prisma.church.findUnique({ where: { id: churchId } });
  if (!church) return null;

  const onboarding = church.onboardingApplicationId
    ? await prisma.onboardingApplication.findUnique({
        where: { id: church.onboardingApplicationId },
        include: { associatedOwners: true, documents: { orderBy: { createdAt: "desc" } } },
      })
    : null;

  return { church, onboarding };
}
