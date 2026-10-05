"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface JobRow {
  jobName: string;
  label: string;
  jobType: string;
  critical: boolean;
  retrySafe: boolean;
  activelyScheduled: boolean;
  status: "NEVER_RUN" | "HEALTHY" | "STALE" | "FAILED" | "PARTIALLY_FAILED";
  lastRun: {
    status: string;
    startedAt: string;
    completedAt: string | null;
    durationMs: number | null;
    processedCount: number | null;
    successCount: number | null;
    failedCount: number | null;
    retryCount: number;
    merchantId: string | null;
  } | null;
  lastSuccessfulRunAt: string | null;
  nextExpectedRunAt: string | null;
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleString() : "—";
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function JobsListClient() {
  const [rows, setRows] = useState<JobRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/admin/system-health/jobs")
      .then((r) => r.json())
      .then((d) => setRows(d.jobs))
      .catch(() => toast.error("Failed to load background jobs"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">System Health — Background Jobs</h1>
        <Link href="/admin/system-health" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to Overview
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Every scheduled cron job this platform runs, instrumented through one standardized run-tracking layer. A non-critical job failing shows as
        Degraded here and never escalates the whole platform to Major Issue by itself.
      </p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Job</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Last Run</th>
              <th className="text-left px-4 py-2">Duration</th>
              <th className="text-left px-4 py-2">Processed / Succeeded / Failed</th>
              <th className="text-left px-4 py-2">Last Success</th>
              <th className="text-left px-4 py-2">Next Expected</th>
              <th className="text-left px-4 py-2">Critical</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-sm">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows?.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400 text-sm">
                  No jobs configured.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.jobName}>
                <td className="px-4 py-2 font-medium text-slate-800">
                  <Link href={`/admin/system-health/jobs/${r.jobName}`} className="hover:underline">
                    {r.label}
                  </Link>
                  {!r.activelyScheduled && <span className="ml-2 text-xs text-slate-400">(not yet scheduled)</span>}
                </td>
                <td className="px-4 py-2">
                  <StateBadge state={r.status === "NEVER_RUN" ? "UNKNOWN" : r.status} label={r.status === "NEVER_RUN" ? "Never Run" : undefined} />
                </td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.lastRun?.startedAt ?? null)}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDuration(r.lastRun?.durationMs ?? null)}</td>
                <td className="px-4 py-2 text-slate-500">
                  {r.lastRun ? `${r.lastRun.processedCount ?? "—"} / ${r.lastRun.successCount ?? "—"} / ${r.lastRun.failedCount ?? "—"}` : "—"}
                </td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.lastSuccessfulRunAt)}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.nextExpectedRunAt)}</td>
                <td className="px-4 py-2">{r.critical ? <StateBadge state="CRITICAL" /> : <span className="text-slate-300 text-xs">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
