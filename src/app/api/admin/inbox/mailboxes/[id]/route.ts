import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMfaVerifiedAdminSession } from "@/lib/auth/requireAdminSession";
import { isAuthError } from "@/lib/auth/errors";

type Params = { params: Promise<{ id: string }> };

/** An admin disconnects their OWN personal mailbox: the stored token and the mail copies are deleted. Shared mailboxes can't be removed here. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const session = await requireMfaVerifiedAdminSession();
    const { id } = await params;
    const mailbox = await prisma.inboxMailbox.findUnique({ where: { id }, select: { id: true, emailAddress: true, ownerAdminUserId: true } });
    if (!mailbox || mailbox.ownerAdminUserId !== session.userId) return NextResponse.json({ error: "Mailbox not found" }, { status: 404 });
    await prisma.inboxMessage.deleteMany({ where: { mailboxId: id } });
    await prisma.inboxMailbox.delete({ where: { id } });
    await prisma.auditLog.create({ data: { action: "ADMIN_INBOX_PERSONAL_DISCONNECTED", actorEmail: session.email, metadata: { mailbox: mailbox.emailAddress } } });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (isAuthError(err)) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Could not disconnect" }, { status: 500 });
  }
}
