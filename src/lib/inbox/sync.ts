import { prisma } from "@/lib/prisma";
import { decryptSecret, deserializeEnvelope } from "@/lib/integrations/aplos/encryption";
import { classifyEmail, normalizeEmail, type SenderRule } from "@/lib/inbox/classify";
import { appendInboxMessageToTicket, createTicketFromInboxMessage } from "@/lib/inbox/tickets";
import { getAccessToken, getMessageText, isZohoDataCenter, listInboxMessages, type ZohoDataCenter } from "@/lib/inbox/zoho";

const MAX_NEW_PER_RUN = 25;

function isUnique(err: unknown) {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code: unknown }).code === "P2002");
}

/** Pulls new Inbox mail from Zoho, classifies it with the rules, and tickets what it can. */
export async function syncMailbox(mailboxId: string) {
  const mailbox = await prisma.inboxMailbox.findUnique({ where: { id: mailboxId } });
  if (!mailbox) throw new Error("Mailbox not found");
  const dc: ZohoDataCenter = isZohoDataCenter(mailbox.dataCenter) ? mailbox.dataCenter : "com";
  let imported = 0;
  let ticketed = 0;
  try {
    const token = await getAccessToken(decryptSecret(deserializeEnvelope(mailbox.encryptedRefreshToken)), dc);
    const listed = await listInboxMessages(token, dc, mailbox.providerAccountId, 50);
    const known = new Set(
      (await prisma.inboxMessage.findMany({ where: { mailboxId, providerMessageId: { in: listed.map((m) => m.messageId) } }, select: { providerMessageId: true } })).map((m) => m.providerMessageId)
    );
    const fresh = listed.filter((m) => !known.has(m.messageId) && normalizeEmail(m.fromAddress) !== mailbox.emailAddress.toLowerCase()).slice(0, MAX_NEW_PER_RUN);
    const rules: SenderRule[] = (await prisma.inboxSenderRule.findMany()).map((r) => ({ kind: r.kind as "BLOCK" | "ALLOW", pattern: r.pattern }));

    for (const m of fresh) {
      const fromEmail = normalizeEmail(m.fromAddress);
      let body = "";
      try {
        body = (await getMessageText(token, dc, mailbox.providerAccountId, m.folderId, m.messageId)).slice(0, 20000);
      } catch (err) {
        console.error("inbox-sync: could not read message body", err instanceof Error ? err.message : err);
      }
      const user = await prisma.user.findFirst({ where: { email: { equals: fromEmail, mode: "insensitive" } }, select: { churchId: true } });
      const result = classifyEmail({ fromEmail, subject: m.subject, body, rules, senderIsKnownUser: Boolean(user) });
      // A "support" message with no org to attach a ticket to needs a person to pick the org.
      const needsOrg = result.classification === "SUPPORT" && !user?.churchId && !result.ticketNumber;
      let row;
      try {
        row = await prisma.inboxMessage.create({
          data: {
            mailboxId, providerMessageId: m.messageId, fromEmail, fromName: m.senderName, subject: m.subject.slice(0, 500), bodyText: body,
            receivedAt: m.receivedAt, toEmail: mailbox.emailAddress,
            classification: needsOrg ? "NEEDS_REVIEW" : result.classification,
            classificationReason: needsOrg ? `${result.reason} — no matching org, pick one to make a ticket` : result.reason,
            churchId: user?.churchId ?? null,
          },
        });
      } catch (err) {
        if (isUnique(err)) continue;
        throw err;
      }
      imported++;
      if (result.classification === "SUPPORT") {
        try {
          if (result.ticketNumber && (await appendInboxMessageToTicket(row.id, result.ticketNumber))) ticketed++;
          else if (user?.churchId) {
            await createTicketFromInboxMessage(row.id, user.churchId, null);
            ticketed++;
          }
          if (!user?.churchId) {
            const after = await prisma.inboxMessage.findUnique({ where: { id: row.id }, select: { ticketId: true } });
            if (!after?.ticketId) {
              await prisma.inboxMessage.update({ where: { id: row.id }, data: { classification: "NEEDS_REVIEW", classificationReason: `${result.reason} — ticket not found, pick an org` } });
            }
          }
        } catch (err) {
          console.error("inbox-sync: ticket creation failed", err instanceof Error ? err.message : err);
        }
      }
    }
    await prisma.inboxMailbox.update({ where: { id: mailboxId }, data: { lastSyncAt: new Date(), lastError: null } });
    return { imported, ticketed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.inboxMailbox.update({ where: { id: mailboxId }, data: { lastError: message.slice(0, 500) } });
    throw err;
  }
}
