import { prisma } from "@/lib/prisma";
import { finixClient } from "@/lib/finix/client";
import { logDashboardAction } from "@/lib/dashboardAudit";

export async function cleanupUnusedLogo(
  oldLogoUrl: string | null | undefined,
  currentLinkId: string | null,
  churchId: string,
  userId: string,
  email: string,
  role: string,
  req?: Request
) {
  if (!oldLogoUrl || !oldLogoUrl.startsWith("/api/files/")) {
    return;
  }

  const fileId = oldLogoUrl.replace("/api/files/", "");

  try {
    // 1. Check other GivingLinks
    const otherLinks = await prisma.givingLink.findMany();
    let referencedInLinks = false;
    for (const link of otherLinks) {
      if (link.id === currentLinkId) continue;
      const branding = link.brandingSettingsJson as any;
      if (branding?.light?.logoUrl === oldLogoUrl || branding?.dark?.logoUrl === oldLogoUrl) {
        referencedInLinks = true;
        break;
      }
    }

    if (referencedInLinks) {
      console.log(`Logo ${fileId} is still referenced by another Giving Link.`);
      return;
    }

    // 2. Check Churches
    const otherChurch = await prisma.church.findFirst({
      where: { logoUrl: oldLogoUrl },
    });
    if (otherChurch) {
      console.log(`Logo ${fileId} is still referenced by a Church branding settings.`);
      return;
    }

    // If we reach here, it is safe to delete from Finix!
    console.log(`Deleting unused logo ${fileId} from Finix.`);
    await finixClient.deleteFile(fileId);

    // Audit log deletion
    await logDashboardAction({
      churchId,
      actorUserId: userId,
      actorEmail: email,
      actorRole: role,
      action: "giving_link.logo_deleted",
      entityType: "giving_link",
      entityId: currentLinkId || undefined,
      metadata: { fileId, logoUrl: oldLogoUrl },
      req,
    });
  } catch (err) {
    console.error(`Failed to clean up unused logo file ${fileId}:`, err);
  }
}
