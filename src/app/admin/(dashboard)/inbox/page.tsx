import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import ConnectZohoForm from "@/components/admin/inbox/ConnectZohoForm";
import SyncButton from "@/components/admin/inbox/SyncButton";
import InboxMessageRow, { type InboxRowData } from "@/components/admin/inbox/InboxMessageRow";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "review", label: "Needs review", where: { classification: "NEEDS_REVIEW", status: "NEW", direction: "IN" } },
  { key: "tickets", label: "Tickets", where: { OR: [{ status: "TICKETED" }, { direction: "OUT" }] } },
  { key: "spam", label: "Spam", where: { classification: "SPAM" } },
  { key: "bulk", label: "Bulk / auto-replies", where: { classification: "BULK" } },
] as const;

/**
 * Admin -> Inbox: WGC's Zoho support mailbox. Rule-based triage (no AI), see
 * src/lib/inbox/classify.ts. Internal only; the AI agents never read this.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];

  const mailbox = await prisma.inboxMailbox.findFirst({ orderBy: { createdAt: "asc" }, select: { emailAddress: true, lastSyncAt: true, lastError: true } });
  const configured = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
  if (!mailbox) {
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
        <ConnectZohoForm configured={configured} />
      </div>
    );
  }

  const [counts, rows] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.inboxMessage.count({ where: t.where as object }))),
    prisma.inboxMessage.findMany({ where: tab.where as object, orderBy: { receivedAt: "desc" }, take: 100 }),
  ]);
  const ticketIds = [...new Set(rows.map((r) => r.ticketId).filter((v): v is string => Boolean(v)))];
  const churchIds = [...new Set(rows.map((r) => r.churchId).filter((v): v is string => Boolean(v)))];
  const [tickets, churches, orgs] = await Promise.all([
    ticketIds.length ? prisma.supportTicket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, ticketNumber: true } }) : [],
    churchIds.length ? prisma.church.findMany({ where: { id: { in: churchIds } }, select: { id: true, name: true } }) : [],
    tab.key === "review" || tab.key === "spam" ? prisma.church.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }) : [],
  ]);
  const ticketNo = new Map(tickets.map((t) => [t.id, t.ticketNumber]));
  const churchName = new Map(churches.map((c) => [c.id, c.name]));

  const data: InboxRowData[] = rows.map((r) => ({
    id: r.id, direction: r.direction, fromEmail: r.fromEmail, fromName: r.fromName, subject: r.subject, bodyText: r.bodyText,
    receivedLabel: r.receivedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }),
    classification: r.classification, reason: r.classificationReason, status: r.status, assignedTo: r.assignedToAdminEmail,
    ticketId: r.ticketId, ticketNumber: r.ticketId ? ticketNo.get(r.ticketId) ?? null : null, churchId: r.churchId, churchName: r.churchId ? churchName.get(r.churchId) ?? null : null,
  }));

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
          <p className="text-sm text-slate-600">
            {mailbox.emailAddress} · {mailbox.lastSyncAt ? `last checked ${mailbox.lastSyncAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}` : "not checked yet"}
          </p>
        </div>
        <SyncButton />
      </div>
      {mailbox.lastError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Last sync problem: {mailbox.lastError}</p>}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <Link key={t.key} href={`/admin/inbox?tab=${t.key}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
            {t.label} <span className="opacity-70">({counts[i]})</span>
          </Link>
        ))}
      </div>
      <div className="space-y-2">
        {data.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nothing here.</p>}
        {data.map((m) => <InboxMessageRow key={m.id} m={m} orgs={orgs} />)}
      </div>
    </div>
  );
}
