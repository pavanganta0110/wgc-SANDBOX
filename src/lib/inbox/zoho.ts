/**
 * Minimal Zoho Mail REST client for the admin Inbox. Uses the OAuth
 * "Self Client" flow: an admin pastes a one-time grant code, we exchange it
 * for a refresh token (stored encrypted) and mint short-lived access tokens
 * from it. The Zoho password is never seen. Env: ZOHO_CLIENT_ID,
 * ZOHO_CLIENT_SECRET. External HTTP only — never call inside a DB transaction.
 */
export class ZohoNotConfiguredError extends Error {
  constructor() {
    super("Zoho is not configured. Set ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET.");
    this.name = "ZohoNotConfiguredError";
  }
}

export const ZOHO_DATA_CENTERS = ["com", "eu", "in", "com.au", "jp"] as const;
export type ZohoDataCenter = (typeof ZOHO_DATA_CENTERS)[number];

export function isZohoDataCenter(v: string): v is ZohoDataCenter {
  return (ZOHO_DATA_CENTERS as readonly string[]).includes(v);
}

export interface ZohoClientCreds {
  clientId: string;
  clientSecret: string;
}

function credentials(override?: ZohoClientCreds | null): ZohoClientCreds {
  if (override?.clientId && override.clientSecret) return override;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new ZohoNotConfiguredError();
  return { clientId, clientSecret };
}

async function zohoFetch(url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    // Never include tokens; status + a short slice of Zoho's own message only.
    throw new Error(`Zoho request failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return json;
}

export async function exchangeGrantCode(grantCode: string, dc: ZohoDataCenter, creds?: ZohoClientCreds | null): Promise<string> {
  const { clientId, clientSecret } = credentials(creds);
  const body = new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, client_secret: clientSecret, code: grantCode.trim() });
  const json = (await zohoFetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body })) as { refresh_token?: string; error?: string } | null;
  if (!json?.refresh_token) throw new Error(`Zoho did not return a refresh token${json?.error ? ` (${json.error})` : ""}. The grant code may be expired or already used.`);
  return json.refresh_token;
}

export async function getAccessToken(refreshToken: string, dc: ZohoDataCenter, creds?: ZohoClientCreds | null): Promise<string> {
  const { clientId, clientSecret } = credentials(creds);
  const body = new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken });
  const json = (await zohoFetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: "POST", body })) as { access_token?: string } | null;
  if (!json?.access_token) throw new Error("Zoho did not return an access token");
  return json.access_token;
}

const authHeaders = (token: string) => ({ Authorization: `Zoho-oauthtoken ${token}`, Accept: "application/json" });

export async function fetchPrimaryAccount(token: string, dc: ZohoDataCenter): Promise<{ accountId: string; emailAddress: string }> {
  const json = (await zohoFetch(`https://mail.zoho.${dc}/api/accounts`, { headers: authHeaders(token) })) as { data?: Array<Record<string, unknown>> } | null;
  const acct = json?.data?.[0];
  const accountId = acct?.accountId ? String(acct.accountId) : "";
  const emailAddress = String(acct?.primaryEmailAddress ?? acct?.mailboxAddress ?? acct?.incomingUserName ?? "").toLowerCase();
  if (!accountId || !emailAddress) throw new Error("Could not read the Zoho mail account");
  return { accountId, emailAddress };
}

export interface ZohoListedMessage {
  messageId: string;
  folderId: string;
  fromAddress: string;
  senderName: string | null;
  subject: string;
  receivedAt: Date;
}

/** Newest messages in the Inbox folder (Zoho's default folder for this call). */
export async function listInboxMessages(token: string, dc: ZohoDataCenter, accountId: string, limit = 50): Promise<ZohoListedMessage[]> {
  const url = `https://mail.zoho.${dc}/api/accounts/${accountId}/messages/view?limit=${limit}&sortBy=date&sortorder=false`;
  const json = (await zohoFetch(url, { headers: authHeaders(token) })) as { data?: Array<Record<string, unknown>> } | null;
  return (json?.data ?? []).map((m) => ({
    messageId: String(m.messageId ?? ""),
    folderId: String(m.folderId ?? ""),
    fromAddress: String(m.fromAddress ?? m.sender ?? ""),
    senderName: m.sender ? String(m.sender) : null,
    subject: String(m.subject ?? "(no subject)"),
    receivedAt: new Date(Number(m.receivedTime ?? m.sentDateInGMT ?? Date.now())),
  })).filter((m) => m.messageId && m.folderId);
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export async function getMessageText(token: string, dc: ZohoDataCenter, accountId: string, folderId: string, messageId: string): Promise<string> {
  const url = `https://mail.zoho.${dc}/api/accounts/${accountId}/folders/${folderId}/messages/${messageId}/content`;
  const json = (await zohoFetch(url, { headers: authHeaders(token) })) as { data?: { content?: string } } | null;
  return htmlToText(json?.data?.content ?? "");
}

export async function sendMail(token: string, dc: ZohoDataCenter, accountId: string, p: { from: string; to: string; subject: string; text: string }): Promise<string | null> {
  const json = (await zohoFetch(`https://mail.zoho.${dc}/api/accounts/${accountId}/messages`, {
    method: "POST",
    headers: { ...authHeaders(token), "Content-Type": "application/json" },
    body: JSON.stringify({ fromAddress: p.from, toAddress: p.to, subject: p.subject, content: p.text.replace(/\n/g, "<br/>"), mailFormat: "html" }),
  })) as { data?: { messageId?: string } } | null;
  return json?.data?.messageId ? String(json.data.messageId) : null;
}
