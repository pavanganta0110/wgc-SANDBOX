import { prisma } from "@/lib/prisma";

/**
 * Who may see an Inbox mailbox. A shared mailbox (no owner) is visible to every admin; a personal mailbox
 * only to the admin who connected it. Every Inbox page, route and sync must go through these helpers.
 */
export function canAccessMailbox(mailbox: { ownerAdminUserId: string | null }, adminUserId: string): boolean {
  return mailbox.ownerAdminUserId === null || mailbox.ownerAdminUserId === adminUserId;
}

/** Prisma filter for the mailboxes an admin may see (shared + their own). */
export function visibleMailboxWhere(adminUserId: string) {
  return { OR: [{ ownerAdminUserId: null }, { ownerAdminUserId: adminUserId }] };
}

/** Removes an admin's personal mailboxes (token and mail copies). Tickets already made from their mail stay. */
export async function disconnectPersonalMailboxesFor(adminUserId: string): Promise<number> {
  const boxes = await prisma.inboxMailbox.findMany({ where: { ownerAdminUserId: adminUserId }, select: { id: true } });
  for (const b of boxes) {
    await prisma.inboxMessage.deleteMany({ where: { mailboxId: b.id } });
    await prisma.inboxMailbox.delete({ where: { id: b.id } });
  }
  return boxes.length;
}
