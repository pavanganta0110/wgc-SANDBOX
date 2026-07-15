"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";
import { formatCents } from "@/lib/format";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import StatementPreviewModal from "@/components/merchant/StatementPreviewModal";

interface Statement {
  id: string;
  taxYear: number;
  version: number;
  statementStatus: string;
  deliveryStatus: string;
  eligibleAmountCents: number;
  donationCount: number;
  generatedAt: string | null;
  sentAt: string | null;
  recipientEmail: string | null;
  resendCount: number;
  supersededAt: string | null;
  failureReason: string | null;
}

const currentYear = new Date().getFullYear();

export default function DonorStatementsPanel({
  donorId,
  donorName,
  donorEmail,
  canGenerate,
  canSend,
}: {
  donorId: string;
  donorName: string;
  donorEmail: string | null;
  canGenerate: boolean;
  canSend: boolean;
}) {
  const [statements, setStatements] = useState<Statement[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [year, setYear] = useState(currentYear - 1);
  const [previewing, setPreviewing] = useState<Statement | null>(null);

  const load = async () => {
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/statements`);
      const data = await res.json();
      setStatements(data.statements ?? []);
    } catch {
      toast.error("Failed to load statement history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/statements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taxYear: year }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      toast.success(data.status === "NEEDS_REVIEW" ? "Statement generated — needs review (missing donor info)" : "Statement generated");
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to generate statement");
    } finally {
      setBusy(false);
    }
  };

  const retrySend = async (statementId: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/statements/${statementId}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send");
      toast.success(`Sent to ${data.recipientEmail}`);
      await load();
    } catch (err: any) {
      toast.error(err.message || "Failed to send statement");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {canGenerate && (
        <div className="flex items-center gap-2 mb-4">
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value, 10))} className="px-3 py-1.5 rounded-lg border border-slate-200 text-sm outline-none">
            {Array.from({ length: 6 }).map((_, i) => {
              const y = currentYear - i;
              return <option key={y} value={y}>{y}</option>;
            })}
          </select>
          <button onClick={generate} disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50">
            Generate Year-End Statement
          </button>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading…</p>
      ) : statements.length === 0 ? (
        <p className="text-sm text-slate-500">No statements generated yet.</p>
      ) : (
        <div className="space-y-3">
          {statements.map((s) => (
            <div key={s.id} className="border-b border-slate-50 last:border-0 pb-2 last:pb-0 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">
                    {s.taxYear} · v{s.version} {s.supersededAt && <span className="text-xs text-slate-400">(superseded)</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {s.donationCount} donations · {formatCents(s.eligibleAmountCents)}
                    {s.sentAt && ` · Sent ${formatDateTimeCDT(s.sentAt)}`}
                    {s.resendCount > 0 && ` (resent ${s.resendCount}x)`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StateBadge state={s.statementStatus} />
                  <StateBadge state={s.deliveryStatus} />
                  {!s.supersededAt && (
                    <button onClick={() => setPreviewing(s)} className="text-xs font-semibold text-blue-600 hover:underline">
                      Preview
                    </button>
                  )}
                </div>
              </div>
              {s.deliveryStatus === "FAILED" && canSend && !s.supersededAt && (
                <div className="mt-1 flex items-center gap-2 bg-red-50 rounded-lg px-2 py-1.5">
                  <p className="text-xs text-red-700 flex-1">
                    Delivery failed{s.failureReason ? `: ${s.failureReason}` : ""}.
                  </p>
                  <button onClick={() => retrySend(s.id)} disabled={busy} className="text-xs font-semibold text-red-700 hover:underline shrink-0">
                    Retry Send
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewing && (
        <StatementPreviewModal
          donorId={donorId}
          statementId={previewing.id}
          donorName={donorName}
          donorEmail={donorEmail}
          taxYear={previewing.taxYear}
          donationCount={previewing.donationCount}
          recordedTotalCents={previewing.eligibleAmountCents}
          version={previewing.version}
          canSend={canSend && previewing.statementStatus !== "NEEDS_REVIEW"}
          onClose={() => setPreviewing(null)}
          onSent={load}
        />
      )}
    </div>
  );
}
