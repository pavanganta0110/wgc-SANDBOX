"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface JobRun {
  id: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  processedCount: number | null;
  successCount: number | null;
  failedCount: number | null;
  retryCount: number;
  attempt: number;
  merchantId: string | null;
  requestId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

interface RelatedEvent {
  id: string;
  createdAt: string;
  status: string;
  severity: string;
  message: string;
  requestId: string | null;
  wgcReference: string | null;
}

interface JobDetail {
  jobName: string;
  label: string;
  jobType: string;
  critical: boolean;
  retrySafe: boolean;
  activelyScheduled: boolean;
  expectedIntervalMs: number;
  staleAfterMs: number | null;
  lastSuccessfulRunAt: string | null;
  runs: JobRun[];
  relatedEvents: RelatedEvent[];
  relatedJobs: string[];
  relatedIncident: { id: string; title: string; status: string; severity: string } | null;
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleString() : "—";
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtInterval(ms: number): string {
  const hours = ms / (60 * 60 * 1000);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

export default function JobDetailClient({ jobName }: { jobName: string }) {
  const [data, setData] = useState<JobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/system-health/jobs/${jobName}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => toast.error("Failed to load job detail"))
      .finally(() => setLoading(false));
  }, [jobName]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const res = await fetch(`/api/admin/system-health/jobs/${jobName}/retry`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Retry failed");
      toast.success(`${data?.label ?? jobName} re-triggered`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retry failed");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link href="/admin/system-health/jobs" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        &larr; All Jobs
      </Link>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {notFound && <p className="text-sm text-slate-400">Job not found.</p>}

      {data && (
        <>
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-xl font-bold text-slate-900">{data.label}</h1>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              {data.critical && <StateBadge state="CRITICAL" label="Critical Job" />}
              {!data.activelyScheduled && <StateBadge state="UNKNOWN" label="Not Yet Scheduled" />}
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            {data.jobName} &middot; {data.jobType} &middot; expected every {fmtInterval(data.expectedIntervalMs)}
            {data.staleAfterMs != null ? `, flagged stale after ${fmtInterval(data.staleAfterMs)} with no success` : ""}
          </p>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <Field label="Last Run" value={fmtDate(data.runs[0]?.startedAt ?? null)} />
            <Field label="Last Run Status" value={data.runs[0] ? <StateBadge state={data.runs[0].status} /> : "—"} />
            <Field label="Last Successful Run" value={fmtDate(data.lastSuccessfulRunAt)} />
            <Field label="Last Duration" value={fmtDuration(data.runs[0]?.durationMs ?? null)} />
            <Field
              label="Related Incident"
              value={
                data.relatedIncident ? (
                  <Link href={`/admin/system-health/incidents/${data.relatedIncident.id}`} className="text-indigo-600 hover:underline">
                    {data.relatedIncident.title}
                  </Link>
                ) : (
                  "None"
                )
              }
            />
            <Field
              label="Retry"
              value={
                data.retrySafe ? (
                  <button
                    onClick={handleRetry}
                    disabled={retrying}
                    className="px-3 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50"
                  >
                    {retrying ? "Retrying…" : "Retry Now"}
                  </button>
                ) : (
                  <span className="text-slate-400 text-xs">Not available — this job&apos;s action isn&apos;t safe to blindly re-trigger.</span>
                )
              }
            />
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Run History</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Started</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Duration</th>
                  <th className="text-left px-4 py-2">Processed / Succeeded / Failed</th>
                  <th className="text-left px-4 py-2">Retry / Attempt</th>
                  <th className="text-left px-4 py-2">Merchant</th>
                  <th className="text-left px-4 py-2">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.runs.map((r) => (
                  <tr key={r.id}>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(r.startedAt)}</td>
                    <td className="px-4 py-2">
                      <StateBadge state={r.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-500">{fmtDuration(r.durationMs)}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.processedCount ?? "—"} / {r.successCount ?? "—"} / {r.failedCount ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-500">
                      {r.retryCount} / {r.attempt}
                    </td>
                    <td className="px-4 py-2 text-slate-500">{r.merchantId ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500 max-w-[240px] truncate">{r.lastErrorMessage ?? "—"}</td>
                  </tr>
                ))}
                {data.runs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No runs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Related Errors</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Message</th>
                  <th className="text-left px-4 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.relatedEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-2">
                      <StateBadge state={e.severity} />
                    </td>
                    <td className="px-4 py-2 text-slate-700 max-w-[320px] truncate">{e.message}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{e.wgcReference ?? "—"}</td>
                  </tr>
                ))}
                {data.relatedEvents.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No related errors recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
