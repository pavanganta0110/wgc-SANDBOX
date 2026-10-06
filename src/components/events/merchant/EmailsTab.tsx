"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { ImagePlus } from "lucide-react";
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
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKind = useRef<"confirmation" | "reminder" | "thankYou" | null>(null);

  function pickPhoto(kind: "confirmation" | "reminder" | "thankYou") {
    pendingKind.current = kind;
    fileRef.current?.click();
  }

  async function uploadPhoto(file: File) {
    const kind = pendingKind.current;
    if (!kind) return;
    setUploadingFor(kind);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/merchant/events/image-upload", { method: "POST", body });
      if (!res.ok) return void toast.error(await readApiError(res, "Couldn't upload that photo."));
      const { imageUrl } = await res.json();
      setT((prev) => ({ ...prev, [kind]: { ...prev[kind], body: `${prev[kind].body.replace(/\s+$/, "")}\n\n[photo: ${imageUrl}]\n` } }) as EmailTemplates);
      toast.success("Photo added to the message");
    } finally {
      setUploadingFor(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

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
        <p className="text-xs text-slate-500 mb-2">Type these into any subject or message — they&apos;re filled in for each recipient. To add pictures (like event photos), use <strong>Add photo</strong> under a message, or type <code className="rounded bg-slate-100 px-1">[photo: https://…]</code> on its own line. For a video, type <code className="rounded bg-slate-100 px-1">[video: https://…]</code> — it shows as a Watch button.</p>
        <div className="flex flex-wrap gap-1.5">
          {EVENT_MERGE_FIELDS.map((f) => (
            <code key={f.token} title={f.label} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{f.token}</code>
          ))}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        aria-label="Photo to add to the email"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void uploadPhoto(file);
        }}
      />

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
          {canManage && (
            <button type="button" onClick={() => pickPhoto("confirmation")} disabled={uploadingFor !== null} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-60">
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" /> {uploadingFor === "confirmation" ? "Uploading…" : "Add photo"}
            </button>
          )}
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
              {canManage && (
            <button type="button" onClick={() => pickPhoto(kind)} disabled={uploadingFor !== null} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 disabled:opacity-60">
              <ImagePlus className="w-3.5 h-3.5" aria-hidden="true" /> {uploadingFor === kind ? "Uploading…" : "Add photo"}
            </button>
          )}
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
