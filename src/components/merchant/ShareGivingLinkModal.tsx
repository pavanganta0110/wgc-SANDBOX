"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { X, Copy, ExternalLink, Download, Printer, QrCode, Mail, MessageSquare, Link2 } from "lucide-react";
import toast from "react-hot-toast";

type ShareTab = "qr" | "email" | "text" | "copy";

export default function ShareGivingLinkModal({
  givingLinkId,
  publicTitle,
  publicUrl,
  onClose,
}: {
  givingLinkId: string;
  publicTitle: string;
  publicUrl: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ShareTab>("qr");
  const [qrPngUrl, setQrPngUrl] = useState<string | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(publicUrl, { width: 320, margin: 1 }).then(setQrPngUrl).catch(() => {});
    QRCode.toString(publicUrl, { type: "svg", width: 320, margin: 1 }).then(setQrSvg).catch(() => {});
  }, [publicUrl]);

  const record = async (channel: string, extra?: Record<string, string>) => {
    try {
      await fetch(`/api/merchant/giving-links/${givingLinkId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, ...extra }),
      });
    } catch {
      // best-effort logging only
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(publicUrl);
    toast.success("Link copied");
    record("COPY_LINK");
  };

  const downloadPng = () => {
    if (!qrPngUrl) return;
    const a = document.createElement("a");
    a.href = qrPngUrl;
    a.download = `${publicTitle.replace(/\s+/g, "-").toLowerCase()}-qr.png`;
    a.click();
    record("QR_CODE");
  };

  const downloadSvg = () => {
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${publicTitle.replace(/\s+/g, "-").toLowerCase()}-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
    record("QR_CODE");
  };

  const handlePrint = () => {
    if (!qrPngUrl) return;
    const win = window.open("", "_blank", "width=400,height=500");
    if (!win) return;
    win.document.write(`
      <html><head><title>${publicTitle}</title></head>
      <body style="text-align:center;font-family:sans-serif;">
        <h3>${publicTitle}</h3>
        <img src="${qrPngUrl}" style="width:280px;height:280px;" />
        <p style="font-size:12px;color:#666;">${publicUrl}</p>
        <script>window.onload = () => window.print();</script>
      </body></html>
    `);
    win.document.close();
    record("QR_CODE");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onClick={(e) => e.stopPropagation()}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">Share Giving Link</h2>
            <p className="text-xs text-slate-400 mt-0.5">Share this giving link with others:</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-4 pt-3 border-b border-slate-100">
          {([
            { key: "qr", label: "QR Code", icon: QrCode },
            { key: "email", label: "Send Email", icon: Mail },
            { key: "text", label: "Send Text", icon: MessageSquare },
            { key: "copy", label: "Copy Link", icon: Link2 },
          ] as { key: ShareTab; label: string; icon: typeof QrCode }[]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                tab === t.key ? "border-blue-600 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {tab === "qr" && (
            <div className="text-center space-y-4">
              {qrPngUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrPngUrl} alt="QR code" className="w-56 h-56 mx-auto rounded-xl border border-slate-100" />
              ) : (
                <div className="w-56 h-56 mx-auto rounded-xl bg-slate-50 animate-pulse" />
              )}
              <p className="text-sm font-semibold text-slate-900">{publicTitle}</p>
              <p className="text-xs text-slate-400 font-mono break-all">{publicUrl}</p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <button onClick={downloadPng} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" /> Download PNG
                </button>
                <button onClick={downloadSvg} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Download className="w-3.5 h-3.5" /> Download SVG
                </button>
                <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Printer className="w-3.5 h-3.5" /> Print
                </button>
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Copy className="w-3.5 h-3.5" /> Copy Link
                </button>
              </div>
            </div>
          )}

          {tab === "email" && <SendEmailPane givingLinkId={givingLinkId} publicTitle={publicTitle} publicUrl={publicUrl} onSent={onClose} />}
          {tab === "text" && <SendTextPane givingLinkId={givingLinkId} publicTitle={publicTitle} publicUrl={publicUrl} onSent={onClose} />}

          {tab === "copy" && (
            <div className="text-center space-y-4 py-4">
              <p className="text-xs text-slate-400 font-mono break-all bg-slate-50 rounded-lg px-3 py-2">{publicUrl}</p>
              <div className="flex items-center justify-center gap-2">
                <button onClick={handleCopy} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700">
                  <Copy className="w-4 h-4" /> Copy Link
                </button>
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="w-4 h-4" /> Open Link
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SendEmailPane({
  givingLinkId,
  publicTitle,
  publicUrl,
  onSent,
}: {
  givingLinkId: string;
  publicTitle: string;
  publicUrl: string;
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState(`${publicTitle} — Give Online`);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!recipient.trim()) {
      toast.error("Please enter a recipient email");
      return;
    }
    setSending(true);
    const res = await fetch(`/api/merchant/giving-links/${givingLinkId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "EMAIL", recipient: recipient.trim(), subject, message }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Failed to send email");
      return;
    }
    toast.success("Email sent");
    onSent();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Recipient Email</label>
        <input
          type="email"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="friend@example.com"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Add a personal note (optional)"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <p className="font-semibold text-slate-700 mb-1">Preview</p>
        <p>{message || `Please consider giving to support us.`}</p>
        <p className="text-blue-600 truncate">{publicUrl}</p>
      </div>
      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}

function SendTextPane({
  givingLinkId,
  publicTitle,
  publicUrl,
  onSent,
}: {
  givingLinkId: string;
  publicTitle: string;
  publicUrl: string;
  onSent: () => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState(`${publicTitle}: `);
  const [sending, setSending] = useState(false);
  const fullBody = `${message} ${publicUrl}`;

  const handleSend = async () => {
    if (!recipient.trim()) {
      toast.error("Please enter a recipient phone number");
      return;
    }
    setSending(true);
    const res = await fetch(`/api/merchant/giving-links/${givingLinkId}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: "TEXT", recipient: recipient.trim(), message }),
    });
    setSending(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data?.error || "Failed to send text");
      return;
    }
    toast.success("Text message sent");
    onSent();
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Recipient Phone</label>
        <input
          type="tel"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          placeholder="(555) 123-4567"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1.5">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-400 mt-1">{fullBody.length} characters</p>
      </div>
      <button
        onClick={handleSend}
        disabled={sending}
        className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </div>
  );
}
