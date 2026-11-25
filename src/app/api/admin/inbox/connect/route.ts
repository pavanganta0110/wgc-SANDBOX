import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { encryptSecret, serializeEnvelope } from "@/lib/integrations/aplos/encryption";
import { exchangeGrantCode, fetchPrimaryAccount, getAccessToken, isZohoDataCenter, ZohoNotConfiguredError, type ZohoClientCreds } from "@/lib/inbox/zoho";

/** Connects (or reconnects) the support mailbox with a one-time Zoho "Self Client" grant code. */
export async function POST(req: Request) {
  try {
    const session = await requireMfaVerifiedAdminSession();
    const body = (await req.json().catch(() => ({}))) as { grantCode?: unknown; dataCenter?: unknown; label?: unknown; personal?: unknown; clientId?: unknown; clientSecret?: unknown };
    const grantCode = typeof body.grantCode === "string" ? body.grantCode.trim() : "";
    const dc = typeof body.dataCenter === "string" ? body.dataCenter : "com";
    if (!grantCode) return NextResponse.json({ error: "Paste the Zoho grant code." }, { status: 400 });
    if (!isZohoDataCenter(dc)) return NextResponse.json({ error: "Unknown Zoho data center." }, { status: 400 });

    const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
    if (Boolean(clientId) !== Boolean(clientSecret)) return NextResponse.json({ error: "Enter both the Client ID and the Client Secret, or leave both empty to use the shared keys." }, { status: 400 });
    const creds: ZohoClientCreds | null = clientId ? { clientId, clientSecret } : null;
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 40) || null : null;

    const personal = body.personal === true;

    const refreshToken = await exchangeGrantCode(grantCode, dc, creds);
    const access = await getAccessToken(refreshToken, dc, creds);
    const account = await fetchPrimaryAccount(access, dc);
    const ownerAdminUserId = personal ? session.userId : null;
    const existing = await prisma.inboxMailbox.findUnique({ where: { emailAddress: account.emailAddress }, select: { ownerAdminUserId: true } });
    if (existing && existing.ownerAdminUserId !== ownerAdminUserId) {
      return NextResponse.json({ error: "That mailbox is already connected as " + (existing.ownerAdminUserId ? "another admin's personal mailbox." : "a shared mailbox.") }, { status: 409 });
    }
    const encryptedRefreshToken = serializeEnvelope(encryptSecret(refreshToken));
    const encryptedClientSecret = creds ? serializeEnvelope(encryptSecret(clientSecret)) : null;
    const mailbox = await prisma.inboxMailbox.upsert({
      where: { emailAddress: account.emailAddress },
      create: { emailAddress: account.emailAddress, providerAccountId: account.accountId, dataCenter: dc, encryptedRefreshToken, connectedByAdminEmail: session.email, ownerAdminUserId, label, clientId: creds ? clientId : null, encryptedClientSecret },
      update: { providerAccountId: account.accountId, dataCenter: dc, encryptedRefreshToken, connectedByAdminEmail: session.email, lastError: null, ...(label ? { label } : {}), clientId: creds ? clientId : null, encryptedClientSecret },
    });
    await prisma.auditLog.create({ data: { action: "ADMIN_INBOX_CONNECTED", actorEmail: session.email, metadata: { mailbox: mailbox.emailAddress, dataCenter: dc, personal } } });
    return NextResponse.json({ success: true, emailAddress: mailbox.emailAddress });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZohoNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("inbox connect failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not connect Zoho" }, { status: 400 });
  }
}
