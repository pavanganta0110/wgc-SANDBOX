"use client";

import { useRef, useState } from "react";
import toast from "react-hot-toast";
import { Paperclip } from "lucide-react";
import StateBadge from "@/components/merchant/StateBadge";

interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
}

interface Message {
  id: string;
  senderRole: string;
  senderEmail: string | null;
  body: string;
  isSystemEvent: boolean;
  createdAt: string;
  attachments: Attachment[];
}

export default function TicketThread({
  ticketId,
  subject,
  meta,
  initialMessages,
  initialStatus,
  canReply,
  canCloseReopen,
  canUploadAttachment,
}: {
  ticketId: string;
  subject: string;
  meta: string;
  initialMessages: Message[];
  initialStatus: string;
  canReply: boolean;
  canCloseReopen: boolean;
  canUploadAttachment: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [status, setStatus] = useState(initialStatus);
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isClosed = status === "RESOLVED" || status === "CLOSED";

  const send = async () => {
    if (!body.trim() && !file) {
      toast.error("Enter a message or attach a file");
      return;
    }
    setSending(true);
    try {
      const formData = new FormData();
      formData.append("body", body);
      if (file) formData.append("file", file);
      const res = await fetch(`/api/merchant/support/tickets/${ticketId}/messages`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send message");
      setMessages((prev) => [...prev, { ...data.message, createdAt: data.message.createdAt }]);
      setBody("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setStatus((prevStatus) => (prevStatus === "OPEN" ? "WAITING_ON_SUPPORT" : prevStatus));
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
    } finally {
      setSending(false);
    }
  };

  const toggleStatus = async () => {
    const action = isClosed ? "reopen" : "close";
    if (action === "close" && !window.confirm("Close this ticket?")) return;
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/merchant/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update ticket");
      setStatus(data.ticket.status);
      toast.success(action === "close" ? "Ticket closed" : "Ticket reopened");
    } catch (err: any) {
      toast.error(err.message || "Failed to update ticket");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-lg font-bold text-slate-900">{subject}</h2>
          <StateBadge state={status} />
        </div>
        <p className="text-xs text-slate-500">{meta}</p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      <div className="space-y-4 mb-6">
        {messages.map((message) => (
          <div key={message.id} className={message.isSystemEvent ? "text-center" : "flex"}>
            {message.isSystemEvent ? (
              <span className="text-xs text-slate-400 italic mx-auto">{message.body}</span>
            ) : (
              <div className={`max-w-[80%] rounded-xl px-4 py-3 ${message.senderRole === "wgc_admin" ? "bg-blue-50" : "bg-slate-50 ml-auto"}`}>
                <div className="text-xs font-semibold text-slate-500 mb-1">
                  {message.senderRole === "wgc_admin" ? "WGC Support" : message.senderEmail || "You"} · {new Date(message.createdAt).toLocaleString()}
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">{message.body}</div>
                {message.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {message.attachments.map((a) => (
                      <div key={a.id} className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Paperclip className="w-3 h-3" /> {a.fileName}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {canReply && !isClosed && (
        <div className="border-t border-slate-100 pt-4">
          <textarea
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400 mb-2"
            rows={3}
            placeholder="Write a reply…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {canUploadAttachment && (
                <>
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" id="ticket-file-input" />
                  <label htmlFor="ticket-file-input" className="flex items-center gap-1 text-xs font-semibold text-slate-600 cursor-pointer hover:text-slate-900">
                    <Paperclip className="w-3.5 h-3.5" /> {file ? file.name : "Attach file"}
                  </label>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {canCloseReopen && (
                <button onClick={toggleStatus} disabled={updatingStatus} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">
                  Close Ticket
                </button>
              )}
              <button onClick={send} disabled={sending} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isClosed && canCloseReopen && (
        <div className="border-t border-slate-100 pt-4 flex justify-end">
          <button onClick={toggleStatus} disabled={updatingStatus} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {updatingStatus ? "Reopening…" : "Reopen Ticket"}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
