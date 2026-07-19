import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getSupportPermissions } from "@/lib/support/supportPermissions";
import TicketThread from "@/components/merchant/TicketThread";
import { categoryLabel } from "@/lib/support/ticketCategories";

export default async function TicketDetailPage({ params }: { params: Promise<{ ticketId: string }> }) {
  const { ticketId } = await params;
  const session = await getSession();

  // Team-access Checkpoint 4A: explicit wgc_admin rejection — see the
  // matching API-route guard comment for why this back door exists
  // otherwise.
  if (session?.role === "wgc_admin") {
    redirect("/merchant/dashboard");
  }
  const permissions = getSupportPermissions(session?.role);
  if (!session?.churchId || !permissions.canView) notFound();

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { attachments: true } } },
  });
  if (!ticket || ticket.churchId !== session.churchId) notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <TicketThread
        ticketId={ticket.id}
        subject={ticket.subject}
        meta={`${categoryLabel(ticket.category)} · Opened ${new Date(ticket.createdAt).toLocaleDateString()}`}
        initialMessages={ticket.messages.map((m) => ({
          id: m.id,
          senderRole: m.senderRole,
          senderEmail: m.senderEmail,
          body: m.body,
          isSystemEvent: m.isSystemEvent,
          createdAt: m.createdAt.toISOString(),
          attachments: m.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType })),
        }))}
        initialStatus={ticket.status}
        canReply={permissions.canReply}
        canCloseReopen={permissions.canCloseReopen}
        canUploadAttachment={permissions.canUploadAttachment}
      />
    </div>
  );
}
