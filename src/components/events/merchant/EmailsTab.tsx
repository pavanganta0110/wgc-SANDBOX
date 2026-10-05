"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { EVENT_MERGE_FIELDS } from "@/lib/eventRegistration/emailTemplates";
import { inputClass, labelClass, primaryButton, readApiError, secondaryButton } from "@/components/events/merchant/api";

export interface EmailTemplates {
  confirmation: { subject: string; body: string };
  reminder: { enabled: boolean; daysBefore: number; subject: string; body: string };
  thankYou: { enabled: boolean; daysAfter: number; subject: string; body: string };
}

export default function EmailsTab({
  eventId,
  initial,
  reminderSentAt,
  thankYouSentAt,
  canManage,
  onSaved,
}: {
  eventId: string;
  initial: EmailTemplates;
  reminderSentAt: string | null;
  thankYouSentAt: string | null;
  canManage: boolean;
  onSaved: () => void;
}) {
  const [t, setT] = useState<EmailTemplates>(initial);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/events/${eventId}/emails`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(t),
      });
      if (!res.ok) return void toast.error(await readApiError(res, "Couldn't save the emails."));
      toast.success("Emails saved");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  async function act(action: "test" | "send", kind: "reminder" | "thankYou", force = false) {
    if (action === "send" && !window.confirm("Send this email to everyone registered for the event right now?")) return;
    setBusy(`${action}-${kind}`);
    try {
      const res = await fetch(`/api/merchant/events/${eventId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, kind, force }),
      });
      if (!res.ok) return void toast.error(await readApiError(res));
      const data = await res.json();
      toast.success(action === "test" ? `Test sent to ${data.sentTo}` : `Sent to ${data.sent} of ${data.recipients} people`);
      if (action === "send") onSaved();
    } finally {
      setBusy(null);
    }
  }

  const disabled = !canManage;

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-sm font-bold text-slate-900 mb-1">Merge fields</p>
        <p className="text-xs text-slate-500 mb-2">Type these into any subject or message — they&apos;re filled in for each recipient.</p>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_MERGE_FIELDS.map((f) => (
            <code key={f.token} title={f.label} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{f.token}</code>
          ))}
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Registration confirmation</h3>
        <p className="text-xs text-slate-500">Sent automatically when someone registers. A summary of their registration is added below your message.</p>
        <div>
          <label htmlFor="em-conf-subject" className={labelClass}>Subject</label>
          <input id="em-conf-subject" disabled={disabled} className={inputClass} value={t.confirmation.subject} onChange={(e) => setT({ ...t, confirmation: { ...t.confirmation, subject: e.target.value } })} />
        </div>
        <div>
          <label htmlFor="em-conf-body" className={labelClass}>Message</label>
          <textarea id="em-conf-body" disabled={disabled} rows={7} className={inputClass} value={t.confirmation.body} onChange={(e) => setT({ ...t, confirmation: { ...t.confirmation, body: e.target.value } })} />
        </div>
      </section>

      {(["reminder", "thankYou"] as const).map((kind) => {
        const isReminder = kind === "reminder";
        const section = t[kind];
        const sentAt = isReminder ? reminderSentAt : thankYouSentAt;
        return (
          <section key={kind} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">{isReminder ? "Reminder email" : "Post-event thank-you"}</h3>
            <label htmlFor={`em-${kind}-enabled`} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                id={`em-${kind}-enabled`}
                type="checkbox"
                disabled={disabled}
                checked={section.enabled}
                onChange={(e) => setT({ ...t, [kind]: { ...section, enabled: e.target.checked } } as EmailTemplates)}
              />
              Send automatically
            </label>
            <div className="max-w-xs">
              <label htmlFor={`em-${kind}-days`} className={labelClass}>{isReminder ? "Days before the event" : "Days after the event"}</label>
              <input
                id={`em-${kind}-days`}
                type="number"
                min={0}
                max={60}
                disabled={disabled}
                className={inputClass}
                value={isReminder ? t.reminder.daysBefore : t.thankYou.daysAfter}
                onChange={(e) =>
                  setT(isReminder ? { ...t, reminder: { ...t.reminder, daysBefore: Number(e.target.value) } } : { ...t, thankYou: { ...t.thankYou, daysAfter: Number(e.target.value) } })
                }
              />
            </div>
            <div>
              <label htmlFor={`em-${kind}-subject`} className={labelClass}>Subject</label>
              <input id={`em-${kind}-subject`} disabled={disabled} className={inputClass} value={section.subject} onChange={(e) => setT({ ...t, [kind]: { ...section, subject: e.target.value } } as EmailTemplates)} />
            </div>
            <div>
              <label htmlFor={`em-${kind}-body`} className={labelClass}>Message</label>
              <textarea id={`em-${kind}-body`} disabled={disabled} rows={7} className={inputClass} value={section.body} onChange={(e) => setT({ ...t, [kind]: { ...section, body: e.target.value } } as EmailTemplates)} />
            </div>
            {canManage && (
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void act("test", kind)}>
                  {busy === `test-${kind}` ? "Sending…" : "Send me a test"}
                </button>
                <button type="button" className={secondaryButton} disabled={busy !== null} onClick={() => void act("send", kind, Boolean(sentAt))}>
                  {sentAt ? "Send again to everyone" : "Send now to everyone"}
                </button>
                {sentAt && <span className="text-xs text-slate-500">Last sent {new Date(sentAt).toLocaleString()}</span>}
              </div>
            )}
            <p className="text-xs text-slate-500">Test emails go to your own address. Save your changes before sending.</p>
          </section>
        );
      })}

      {canManage && (
        <div className="flex justify-end">
          <button type="button" className={primaryButton} disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save emails"}
          </button>
        </div>
      )}
    </div>
  );
}
