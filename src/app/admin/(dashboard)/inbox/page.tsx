import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import ConnectZohoForm from "@/components/admin/inbox/ConnectZohoForm";
import DisconnectMailboxButton from "@/components/admin/inbox/DisconnectMailboxButton";
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
 * Admin -> Inbox. Shared mailboxes (support, company) get rule-based triage (see src/lib/inbox/classify.ts) and
 * are visible to every admin. "My mail" shows only the signed-in admin's own personal mailbox(es): no one else
 * can see them (src/lib/inbox/access.ts). Internal only; the AI agents never read this.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; mailbox?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { tab: tabParam, mailbox: mailboxParam } = await searchParams;
  const isMine = tabParam === "mine";
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];
  const configured = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET);

  const [mailboxes, mine] = await Promise.all([
    prisma.inboxMailbox.findMany({ where: { ownerAdminUserId: null }, orderBy: { createdAt: "asc" }, select: { id: true, emailAddress: true, label: true, lastError: true } }),
    prisma.inboxMailbox.findMany({ where: { ownerAdminUserId: session.userId }, orderBy: { createdAt: "asc" }, select: { id: true, emailAddress: true, label: true, lastSyncAt: true, lastError: true } }),
  ]);

  const tabLinks = (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => (
        <Link key={t.key} href={`/admin/inbox?tab=${t.key}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${!isMine && t.key === tab.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>{t.label}</Link>
      ))}
      <Link href="/admin/inbox?tab=mine" className={`rounded-full px-3 py-1.5 text-sm font-semibold ${isMine ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>My mail</Link>
    </div>
  );

  // --- My mail: only this admin's own mailbox(es) -------------------------------------------------
  if (isMine) {
    const rows = mine.length ? await prisma.inboxMessage.findMany({ where: { mailboxId: { in: mine.map((m) => m.id) } }, orderBy: { receivedAt: "desc" }, take: 100 }) : [];
    const ticketIds = [...new Set(rows.map((r) => r.ticketId).filter((v): v is string => Boolean(v)))];
    const [tickets, orgs] = await Promise.all([
      ticketIds.length ? prisma.supportTicket.findMany({ where: { id: { in: ticketIds } }, select: { id: true, ticketNumber: true } }) : [],
      prisma.church.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
    ]);
    const ticketNo = new Map(tickets.map((t) => [t.id, t.ticketNumber]));
    const name = new Map(mine.map((m) => [m.id, m.label || m.emailAddress]));
    const data: InboxRowData[] = rows.map((r) => ({
      id: r.id, direction: r.direction, fromEmail: r.fromEmail, fromName: r.fromName, subject: r.subject, bodyText: r.bodyText,
      receivedLabel: r.receivedAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }),
      classification: r.classification, reason: "Private to you", status: r.status, assignedTo: null,
      ticketId: r.ticketId, ticketNumber: r.ticketId ? ticketNo.get(r.ticketId) ?? null : null, churchId: r.churchId, churchName: null,
      mailboxLabel: name.get(r.mailboxId) ?? "", personal: true,
    }));
    return (
      <div className="max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
            <p className="text-sm text-slate-600">My mail is private: only you can see it, other admins cannot.</p>
          </div>
          {mine.length > 0 && <SyncButton />}
        </div>
        {tabLinks}
        {mine.map((mb) => (
          <div key={mb.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
            <span className="text-slate-700">{mb.label ? `${mb.label} · ` : ""}{mb.emailAddress}{mb.lastError ? <span className="ml-2 text-red-600">Sync problem: {mb.lastError}</span> : null}</span>
            <DisconnectMailboxButton id={mb.id} />
          </div>
        ))}
        {mine.length === 0 ? (
          <ConnectZohoForm configured={configured} additional personal />
        ) : (
          <div className="space-y-2">
            {data.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">No mail yet. Press Check mail now.</p>}
            {data.map((m) => <InboxMessageRow key={m.id} m={m} orgs={orgs} />)}
          </div>
        )}
      </div>
    );
  }

  // --- Shared mailboxes ------------------------------------------------------------------------------
  if (mailboxes.length === 0) {
    return (
      <div className="max-w-3xl space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
        {tabLinks}
        <ConnectZohoForm configured={configured} />
      </div>
    );
  }

  const selected = mailboxes.find((mb) => mb.id === mailboxParam) ?? null;
  const sharedScope = { mailbox: { ownerAdminUserId: null } };
  const scope = selected ? { mailboxId: selected.id } : {};
  const mailboxName = new Map(mailboxes.map((mb) => [mb.id, mb.label || mb.emailAddress]));
  const [counts, rows, syncInfo] = await Promise.all([
    Promise.all(TABS.map((t) => prisma.inboxMessage.count({ where: { AND: [t.where as object, sharedScope, scope] } }))),
    prisma.inboxMessage.findMany({ where: { AND: [tab.where as object, sharedScope, scope] }, orderBy: { receivedAt: "desc" }, take: 100 }),
    prisma.inboxMailbox.findFirst({ where: { ownerAdminUserId: null, lastSyncAt: { not: null } }, orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } }),
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
    mailboxLabel: mailboxName.get(r.mailboxId) ?? "", personal: false,
  }));

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Inbox</h2>
          <p className="text-sm text-slate-600">
            {mailboxes.map((mb) => `${mb.label ? `${mb.label} · ` : ""}${mb.emailAddress}`).join("  |  ")}
            {syncInfo?.lastSyncAt ? `  ·  last checked ${syncInfo.lastSyncAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" })}` : ""}
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
          <Link key={t.key} href={`/admin/inbox?tab=${t.key}${selected ? `&mailbox=${selected.id}` : ""}`} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === tab.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-700"}`}>
            {t.label} <span className="opacity-70">({counts[i]})</span>
          </Link>
        ))}
        <Link href="/admin/inbox?tab=mine" className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700">My mail</Link>
      </div>
      <div className="space-y-2">
        {data.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nothing here.</p>}
        {data.map((m) => <InboxMessageRow key={m.id} m={m} orgs={orgs} />)}
      </div>
      <details className="rounded-xl border border-slate-200 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">Connect another shared mailbox (visible to every admin)</summary>
        <div className="mt-4"><ConnectZohoForm configured={configured} additional /></div>
      </details>
    </div>
  );
}
