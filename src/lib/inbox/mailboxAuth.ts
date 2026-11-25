import { decryptSecret, deserializeEnvelope } from "@/lib/integrations/aplos/encryption";
import { getAccessToken, isZohoDataCenter, type ZohoClientCreds, type ZohoDataCenter } from "@/lib/inbox/zoho";

interface MailboxAuthFields {
  dataCenter: string;
  encryptedRefreshToken: string;
  clientId: string | null;
  encryptedClientSecret: string | null;
}

/** A mailbox's own Zoho keys when it has them, otherwise null (the shared env keys apply). */
export function mailboxCreds(m: Pick<MailboxAuthFields, "clientId" | "encryptedClientSecret">): ZohoClientCreds | null {
  if (!m.clientId || !m.encryptedClientSecret) return null;
  return { clientId: m.clientId, clientSecret: decryptSecret(deserializeEnvelope(m.encryptedClientSecret)) };
}

export function mailboxDataCenter(m: Pick<MailboxAuthFields, "dataCenter">): ZohoDataCenter {
  return isZohoDataCenter(m.dataCenter) ? m.dataCenter : "com";
}

/** Short-lived Zoho access token for a stored mailbox. */
export async function accessTokenForMailbox(m: MailboxAuthFields): Promise<string> {
  return getAccessToken(decryptSecret(deserializeEnvelope(m.encryptedRefreshToken)), mailboxDataCenter(m), mailboxCreds(m));
}
