import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { encryptSecret, serializeEnvelope } from "@/lib/integrations/aplos/encryption";
import { exchangeGrantCode, fetchPrimaryAccount, getAccessToken, isZohoDataCenter, ZohoNotConfiguredError } from "@/lib/inbox/zoho";

/** Connects (or reconnects) the support mailbox with a one-time Zoho "Self Client" grant code. */
export async function POST(req: Request) {
  try {
    const session = await requireMfaVerifiedAdminSession();
    const body = (await req.json().catch(() => ({}))) as { grantCode?: unknown; dataCenter?: unknown };
    const grantCode = typeof body.grantCode === "string" ? body.grantCode.trim() : "";
    const dc = typeof body.dataCenter === "string" ? body.dataCenter : "com";
    if (!grantCode) return NextResponse.json({ error: "Paste the Zoho grant code." }, { status: 400 });
    if (!isZohoDataCenter(dc)) return NextResponse.json({ error: "Unknown Zoho data center." }, { status: 400 });

    const refreshToken = await exchangeGrantCode(grantCode, dc);
    const access = await getAccessToken(refreshToken, dc);
    const account = await fetchPrimaryAccount(access, dc);
    const encryptedRefreshToken = serializeEnvelope(encryptSecret(refreshToken));
    const mailbox = await prisma.inboxMailbox.upsert({
      where: { emailAddress: account.emailAddress },
      create: { emailAddress: account.emailAddress, providerAccountId: account.accountId, dataCenter: dc, encryptedRefreshToken, connectedByAdminEmail: session.email },
      update: { providerAccountId: account.accountId, dataCenter: dc, encryptedRefreshToken, connectedByAdminEmail: session.email, lastError: null },
    });
    await prisma.auditLog.create({ data: { action: "ADMIN_INBOX_CONNECTED", actorEmail: session.email, metadata: { mailbox: mailbox.emailAddress, dataCenter: dc } } });
    return NextResponse.json({ success: true, emailAddress: mailbox.emailAddress });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof ZohoNotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("inbox connect failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not connect Zoho" }, { status: 400 });
  }
}
