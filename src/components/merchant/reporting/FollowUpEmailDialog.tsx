"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Send, X } from "lucide-react";
import {
  DEFAULT_FOLLOW_UP_BODY,
  DEFAULT_FOLLOW_UP_SUBJECT,
  FOLLOW_UP_BODY_MAX,
  FOLLOW_UP_SUBJECT_MAX,
} from "@/lib/reporting/followUpTemplate";

interface Preview {
  to: string;
  toName: string;
  subject: string;
  replyTo: string;
  html: string;
}

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";

/**
 * Composer for a one-off follow-up email to a lapsed donor: editable
 * subject/message (with {{firstName}} / {{orgName}}), a live preview that is
 * rendered by the server with the same code as the real send, and a Send
 * button. Nothing is sent until the merchant clicks Send.
 */
export default function FollowUpEmailDialog({
  donorId,
  donorName,
  onClose,
}: {
  donorId: string;
  donorName: string;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(DEFAULT_FOLLOW_UP_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_FOLLOW_UP_BODY);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sending && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, sending]);

  // Debounced server-side preview so the merchant sees the exact email as they type.
  useEffect(() => {
    if (!subject.trim() || !message.trim()) {
      setPreview(null);
      setPreviewError(null);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/merchant/reporting/follow-up", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "preview", donorId, subject, body: message }),
        });
        const data = await res.json().catch(() => ({}));
        if (id !== requestId.current) return;
        if (!res.ok) {
          setPreview(null);
          setPreviewError(typeof data.error === "string" ? data.error : "Couldn't load the preview.");
        } else {
          setPreview(data);
          setPreviewError(null);
        }
      } catch {
        if (id === requestId.current) setPreviewError("Couldn't load the preview.");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [donorId, subject, message]);

  async function send() {
    if (!preview || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/merchant/reporting/follow-up", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", donorId, subject, body: message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data.error === "string" ? data.error : "The email could not be sent.");
        return;
      }
      toast.success(`Email sent to ${preview.to}`);
      onClose();
    } catch {
      toast.error("The email could not be sent.");
    } finally {
      setSending(false);
    }
  }

  const canSend = Boolean(preview) && !previewError && !loading && !sending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Email ${donorName}`}>
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !sending && onClose()} aria-hidden />
      <div className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Email {donorName}</h2>
            <p className="text-xs text-slate-500">
              Review the message and preview, then send. Nothing is sent until you click Send.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} aria-label="Close" className={`rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 ${FOCUS}`}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label htmlFor="fu-to" className="mb-1 block text-xs font-semibold text-slate-600">To</label>
              <input id="fu-to" readOnly value={preview ? `${preview.toName} <${preview.to}>` : donorName} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" />
            </div>
            <div>
              <label htmlFor="fu-subject" className="mb-1 block text-xs font-semibold text-slate-600">Subject</label>
              <input
                id="fu-subject"
                value={subject}
                maxLength={FOLLOW_UP_SUBJECT_MAX}
                onChange={(e) => setSubject(e.target.value)}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 ${FOCUS}`}
              />
            </div>
            <div>
              <label htmlFor="fu-message" className="mb-1 block text-xs font-semibold text-slate-600">Message</label>
              <textarea
                id="fu-message"
                rows={11}
                value={message}
                maxLength={FOLLOW_UP_BODY_MAX}
                onChange={(e) => setMessage(e.target.value)}
                className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm leading-relaxed text-slate-900 ${FOCUS}`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Use <code className="rounded bg-slate-100 px-1">{"{{firstName}}"}</code> and <code className="rounded bg-slate-100 px-1">{"{{orgName}}"}</code> to personalize.
              </p>
            </div>
            {preview && (
              <p className="text-xs text-slate-500">Replies to this email go to <span className="font-semibold text-slate-700">{preview.replyTo}</span>.</p>
            )}
          </div>

          <div className="flex min-h-[420px] flex-col">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Preview</span>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Updating preview" />}
            </div>
            {preview && (
              <p className="mb-2 truncate text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Subject:</span> {preview.subject}
              </p>
            )}
            <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {previewError ? (
                <p className="p-4 text-sm text-rose-700" role="alert">{previewError}</p>
              ) : preview ? (
                <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-full min-h-[420px] w-full bg-white" />
              ) : (
                <p className="p-4 text-sm text-slate-500">Add a subject and message to see the preview.</p>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} disabled={sending} className={`rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 ${FOCUS}`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            className={`inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            {sending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>
    </div>
  );
}
