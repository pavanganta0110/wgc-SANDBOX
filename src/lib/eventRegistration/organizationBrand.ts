import { prisma } from "@/lib/prisma";
import { parseBrandingSettings, resolveGivingPageLogo } from "@/lib/givingLinks/types";

/** The org name and logo the public event page shows, for the editor's live preview. Always scoped to the signed-in church. */
export async function loadOrganizationBrand(churchId: string, givingLinkId?: string | null): Promise<{ name: string; logoUrl: string | null }> {
  const church = await prisma.church.findUnique({ where: { id: churchId }, select: { name: true, logoUrl: true } });
  const link = givingLinkId ? await prisma.givingLink.findFirst({ where: { id: givingLinkId, churchId }, select: { brandingSettingsJson: true } }) : null;
  const branding = parseBrandingSettings(link?.brandingSettingsJson ?? null);
  return {
    name: church?.name || "Your organization",
    logoUrl: resolveGivingPageLogo({ givingPageLogoUrl: branding.light.logoUrl, organizationLogoUrl: church?.logoUrl, fallbackLogoUrl: null }) || null,
  };
}
