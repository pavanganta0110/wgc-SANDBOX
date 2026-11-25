import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";
import { syncMailbox } from "@/lib/inbox/sync";

/** "Check mail now" button. */
export async function POST() {
  try {
    await requireMfaVerifiedAdminSession();
    const mailboxes = await prisma.inboxMailbox.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, emailAddress: true } });
    if (mailboxes.length === 0) return NextResponse.json({ error: "Connect a Zoho mailbox first." }, { status: 400 });
    let imported = 0;
    let ticketed = 0;
    const failures: string[] = [];
    for (const mb of mailboxes) {
      try {
        const r = await syncMailbox(mb.id);
        imported += r.imported;
        ticketed += r.ticketed;
      } catch (err) {
        failures.push(`${mb.emailAddress}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    if (failures.length === mailboxes.length) return NextResponse.json({ error: failures.join(" | ") }, { status: 500 });
    return NextResponse.json({ success: true, imported, ticketed, warnings: failures });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}
