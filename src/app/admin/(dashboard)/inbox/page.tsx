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
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; mailbox?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { tab: tabParam, mailbox: mailboxParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];

  const mailboxes = await prisma.inboxMailbox.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, emailAddress: true, label: true, lastSyncAt: true, lastError: true } });
  const configured = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);
  if (mailboxes.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
        <ConnectZohoForm configured={configured} />
      </div>
    );
  }

  const selected = mailboxes.find((mb) => mb.id === mailboxParam) ?? null;
  const scope = selected ? { mailboxId: selected.id } : {};
  const mailboxName = new Map(mailboxes.map((mb) => [mb.id, mb.label || mb.emailAddress]));
  const [counts, rows] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.inboxMessage.count({ where: { AND: [t.where as object, scope] } }))),
    prisma.inboxMessage.findMany({ where: { AND: [tab.where as object, scope] }, orderBy: { receivedAt: "desc" }, take: 100 }),
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
    mailboxLabel: mailboxName.get(r.mailboxId) ?? "",
  }));

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
          <p className="text-sm text-slate-600">
            {mailboxes.map((mb) => `${mb.label ? `${mb.label} · ` : ""}${mb.emailAddress}`).join("  |  ")}
          </p>
        </div>
        <SyncButton />
      </div>
      {mailboxes.filter((mb) => mb.lastError).map((mb) => (
        <p key={mb.id} className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Last sync problem for {mb.emailAddress}: {mb.lastError}</p>
      ))}
      {mailboxes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/inbox?tab=${tab.key}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${!selected ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>All mailboxes</Link>
          {mailboxes.map((mb) => (
            <Link key={mb.id} href={`/admin/inbox?tab=${tab.key}&mailbox=${mb.id}`} className={`rounded-full px-3 py-1 text-xs font-semibold ${selected?.id === mb.id ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{mb.label || mb.emailAddress}</Link>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t, i) => (
          <Link key={t.key} href={`/admin/inbox?tab=${t.key}${selected ? `&mailbox=${selected.id}` : ""}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-slate-900 text-white" : "bg-white text-slate-700 border border-slate-200"}`}>
            {t.label} <span className="opacity-70">({counts[i]})</span>
          </Link>
        ))}
      </div>
      <div className="space-y-2">
        {data.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nothing here.</p>}
        {data.map((m) => <InboxMessageRow key={m.id} m={m} orgs={orgs} />)}
      </div>
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Connect another mailbox (for example company and support)</summary>
        <div className="mt-4"><ConnectZohoForm configured={configured} additional /></div>
      </details>
    </div>
  );
}
