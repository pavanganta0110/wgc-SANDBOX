import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { syncMailbox } from "@/lib/inbox/sync";

/** "Check mail now" button. */
export async function POST() {
  try {
    await requireMfaVerifiedAdminSession();
    const mailbox = await prisma.inboxMailbox.findFirst({ orderBy: { createdAt: "asc" } });
    if (!mailbox) return NextResponse.json({ error: "Connect a Zoho mailbox first." }, { status: 400 });
    const result = await syncMailbox(mailbox.id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
