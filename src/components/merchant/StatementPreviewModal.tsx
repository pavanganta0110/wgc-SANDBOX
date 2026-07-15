"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { X, RefreshCw } from "lucide-react";
import { formatCents } from "@/lib/format";

export default function StatementPreviewModal({
  donorId,
  statementId,
  donorName,
  donorEmail,
  taxYear,
  donationCount,
  recordedTotalCents,
  version,
  canSend,
  onClose,
  onSent,
}: {
  donorId: string;
  statementId: string;
  donorName: string;
  donorEmail: string | null;
  taxYear: number;
  donationCount: number;
  recordedTotalCents: number;
  version: number;
  canSend: boolean;
  onClose: () => void;
  onSent?: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);

  const previewUrl = `/api/merchant/donors/${donorId}/statements/${statementId}/download?inline=1&attempt=${previewAttempt}`;

  const send = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/statements/${statementId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast.success(`Sent to ${data.recipientEmail}`);
      setConfirming(false);
      onSent?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to send statement");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">
            {taxYear} Year-End Donation Statement — {donorName}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 bg-slate-50 relative">
          <iframe key={previewAttempt} src={previewUrl} className="w-full h-full border-0" title="Statement preview" />
          <button
            onClick={() => setPreviewAttempt((a) => a + 1)}
            className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 shadow-sm"
            title="If the preview failed to load, retry"
          >
            <RefreshCw className="w-3 h-3" />
            Retry Preview
          </button>
        </div>

        <div className="px-6 py-4 border-t border-slate-100">
          {confirming ? (
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-2">Confirm send</p>
              <div className="grid grid-cols-2 gap-2 text-sm mb-4">
                <Row label="Donor" value={donorName} />
                <Row label="Email" value={donorEmail || "Missing"} />
                <Row label="Statement Year" value={String(taxYear)} />
                <Row label="Version" value={String(version)} />
                <Row label="Donation Count" value={String(donationCount)} />
                <Row label="Recorded Total" value={formatCents(recordedTotalCents)} />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={send}
                  disabled={sending}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Confirm and Send"}
                </button>
                <button onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-800">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2">
              <a
                href={`/api/merchant/donors/${donorId}/statements/${statementId}/download`}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Download PDF
              </a>
              {canSend && (
                <button
                  onClick={() => setConfirming(true)}
                  className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Send Statement
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
