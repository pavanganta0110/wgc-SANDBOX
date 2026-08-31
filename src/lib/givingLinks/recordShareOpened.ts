import { prisma } from "@/lib/prisma";

/**
 * Records a click-through "opened" event for an Email/Text giving-link
 * share — the tracked URL embeds the share's own id (see
 * src/app/api/merchant/giving-links/[id]/share/route.ts), and this marks
 * openedAt the first time that exact link is actually visited.
 *
 * Scoped to givingLinkId so a share id from one giving link can never mark
 * a share on a different link as opened. Only the first visit counts —
 * openedAt is set once and never overwritten by a later revisit.
 */
export async function recordGivingLinkShareOpened(shareId: string, givingLinkId: string): Promise<void> {
  try {
    await prisma.givingLinkShare.updateMany({
      where: { id: shareId, givingLinkId, openedAt: null },
      data: { openedAt: new Date() },
    });
  } catch (err) {
    console.error("Failed to record giving link share opened:", err);
  }
}
