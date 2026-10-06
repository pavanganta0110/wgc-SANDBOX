"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, ExternalLink, Pencil } from "lucide-react";
import toast from "react-hot-toast";
import { formatCents } from "@/lib/format";
import { inputClass, readApiError, secondaryButton } from "@/components/events/merchant/api";
import EventSettingsForm, { type AddOnFormValue, type EventFormValues } from "@/components/events/merchant/EventSettingsForm";
import RegistrationsTab from "@/components/events/merchant/RegistrationsTab";
import AttendeesTab from "@/components/events/merchant/AttendeesTab";
import EmailsTab, { type EmailTemplates } from "@/components/events/merchant/EmailsTab";
import EventEmbedPanel from "@/components/events/merchant/EventEmbedPanel";

interface Stats {
  registrations: number;
  attendees: number;
  checkedIn: number;
  revenueCents: number;
  pendingRegistrations: number;
}

type EventDetail = EventFormValues & {
  id: string;
  slug: string;
  publicUrl: string;
  embedOrigin: string;
  startsAt: string;
  emailTemplates: EmailTemplates;
  reminderSentAt: string | null;
  thankYouSentAt: string | null;
};

const TABS = ["Overview", "Registrations", "Attendees", "Emails", "Settings"] as const;
type Tab = (typeof TABS)[number];

export default function EventDetailClient({
  eventId,
  canManage,
  canManageAttendees,
  canExport,
  organization,
  justCreated,
}: {
  organization: { name: string; logoUrl: string | null };
  justCreated?: "draft" | "published";
  eventId: string;
  canManage: boolean;
  canManageAttendees: boolean;
  canExport: boolean;
}) {
  const [tab, setTab] = useState<Tab>("Overview");
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [addOns, setAddOns] = useState<AddOnFormValue[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bumping this refetches (after a settings save, a check-in, an email send).
  const [reloadKey, setReloadKey] = useState(0);
  const load = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/merchant/events/${eventId}`, { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) return setError(await readApiError(res, "We couldn't load this event."));
      const data = await res.json();
      if (cancelled) return;
      setEvent(data.event);
      setAddOns(data.addOns);
      setStats(data.stats);
    })();
    return () => {
      cancelled = true;
    };
  }, [eventId, reloadKey]);

  if (error) return <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>;
  if (!event) return <p className="mt-4 text-sm text-slate-500">Loading…</p>;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(event.publicUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="mt-2">
      <div className="sm:flex sm:items-start sm:justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium">{event.name}</h2>
          <p className="text-sm text-slate-500">Status: {event.status}</p>
        </div>
        <div className="mt-3 sm:mt-0 flex flex-wrap gap-2">
          {canManage && (
            <button type="button" onClick={() => setTab("Settings")} className={secondaryButton}>
              <Pencil className="w-4 h-4 mr-1.5" aria-hidden="true" /> Edit event
            </button>
          )}
          <button type="button" onClick={copyLink} className={secondaryButton}>
            <Copy className="w-4 h-4 mr-1.5" aria-hidden="true" /> Copy link
          </button>
          <a href={event.publicUrl} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
            <ExternalLink className="w-4 h-4 mr-1.5" aria-hidden="true" /> {event.status === "ACTIVE" ? "View page" : "Preview page"}
          </a>
        </div>
      </div>

      {event.status !== "ACTIVE" && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-wrap items-center justify-between gap-3">
          <p>
            {justCreated === "draft" ? "Your event is saved as a draft. " : ""}
            <strong>This event isn&apos;t published yet</strong>, so the public link shows &ldquo;not found&rdquo; to everyone but your signed-in team. Use <em>View page</em> to preview it, then publish when you&apos;re ready.
          </p>
          {canManage && (
            <button type="button" onClick={() => setTab("Settings")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500">
              Edit &amp; publish
            </button>
          )}
        </div>
      )}
      {justCreated === "published" && event.status === "ACTIVE" && (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">Your event is published and accepting registrations.</div>
      )}

      <div role="tablist" aria-label="Event sections" className="flex gap-1 border-b border-slate-200 mb-6 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px ${tab === t ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "Overview" && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                ["Registrations", String(stats.registrations)],
                ["Attendees", String(stats.attendees)],
                ["Checked in", `${stats.checkedIn} of ${stats.attendees}`],
                ["Revenue", formatCents(stats.revenueCents)],
              ].map(([label, value]) => (
                <div key={label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                  <p className="text-xs text-slate-500 mb-1">{label}</p>
                  <p className="text-xl font-bold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            {stats.pendingRegistrations > 0 && (
              <p className="text-xs text-slate-500">{stats.pendingRegistrations} unfinished checkout{stats.pendingRegistrations === 1 ? "" : "s"} — started but not paid. These are not counted above.</p>
            )}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <label htmlFor="ev-public-url" className="block text-xs font-semibold text-slate-600 mb-1">Public registration link</label>
              <input id="ev-public-url" readOnly className={inputClass} value={event.publicUrl} onFocus={(e) => e.currentTarget.select()} />
              {event.status !== "ACTIVE" && <p className="text-xs text-amber-700 mt-2">This event is {event.status.toLowerCase()} — the link won&apos;t work until you set the status to Active in Settings.</p>}
            </div>
            <EventEmbedPanel
              slug={event.slug}
              origin={event.embedOrigin}
              publicUrl={event.publicUrl}
              isActive={event.status === "ACTIVE"}
              takesPayment={event.priceCents > 0 || addOns.some((a) => a.isActive) || event.allowOptionalDonation}
            />
          </div>
        )}
        {tab === "Registrations" && <RegistrationsTab eventId={eventId} canExport={canExport} />}
        {tab === "Attendees" && <AttendeesTab eventId={eventId} canManageAttendees={canManageAttendees} canExport={canExport} onChange={load} />}
        {tab === "Emails" && <EmailsTab eventId={eventId} initial={event.emailTemplates} reminderSentAt={event.reminderSentAt} thankYouSentAt={event.thankYouSentAt} canManage={canManage} onSaved={load} />}
        {tab === "Settings" &&
          (canManage ? (
            <div>
              <EventSettingsForm organization={organization} eventId={eventId} initialValues={event} initialAddOns={addOns} onSaved={load} key={JSON.stringify([event.name, event.status, event.startsAtLocal])} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">You don&apos;t have permission to edit this event.</p>
          ))}
      </div>
    </div>
  );
}
