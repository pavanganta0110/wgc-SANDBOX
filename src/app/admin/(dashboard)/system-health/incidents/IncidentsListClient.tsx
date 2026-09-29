"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface IncidentRow {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  startedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  affectedMerchantCount: number;
  affectedUserCount: number;
  notifiedChannels: string[];
}

const STATUSES = ["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED", "IGNORED"];
const SEVERITIES = ["CRITICAL", "ERROR", "WARNING", "INFO"];

function fmtDate(d: string): string {
  return new Date(d).toLocaleString();
}

function fmtDuration(startedAt: string, resolvedAt: string | null): string {
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const ms = end - new Date(startedAt).getTime();
  const hours = ms / (60 * 60 * 1000);
  if (hours < 1) return `${Math.round(ms / 60000)}m`;
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function IncidentsListClient() {
  const [rows, setRows] = useState<IncidentRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [service, setService] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (severity) params.set("severity", severity);
    if (service) params.set("service", service);
    fetch(`/api/admin/system-health/incidents?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.incidents))
      .catch(() => toast.error("Failed to load incidents"))
      .finally(() => setLoading(false));
  }, [status, severity, service]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">System Health — Incidents</h1>
        <Link href="/admin/system-health" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to Overview
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Automatically detected and grouped by fingerprint — a repeat failure updates the same incident rather than creating a new one. Nothing here
        needs to be manually created for a normal, machine-detectable problem.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 mb-6">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={service}
          onChange={(e) => setService(e.target.value)}
          placeholder="Filter by service (e.g. Finix)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Severity</th>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Service</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Started</th>
              <th className="text-left px-4 py-2">Last Seen</th>
              <th className="text-left px-4 py-2">Duration</th>
              <th className="text-left px-4 py-2">Occurrences</th>
              <th className="text-left px-4 py-2">Merchants</th>
              <th className="text-left px-4 py-2">Notified</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-400 text-sm">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows?.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-slate-400 text-sm">
                  No incidents recorded.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <StateBadge state={r.severity} />
                </td>
                <td className="px-4 py-2 max-w-[260px] truncate font-medium text-slate-800">
                  <Link href={`/admin/system-health/incidents/${r.id}`} className="hover:underline">
                    {r.title}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">{r.service}</td>
                <td className="px-4 py-2">
                  <StateBadge state={r.status} />
                </td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.startedAt)}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.lastSeenAt)}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDuration(r.startedAt, r.resolvedAt)}</td>
                <td className="px-4 py-2 text-slate-500">{r.occurrenceCount}</td>
                <td className="px-4 py-2 text-slate-500">{r.affectedMerchantCount}</td>
                <td className="px-4 py-2 text-slate-500 text-xs">{r.notifiedChannels.length > 0 ? r.notifiedChannels.join(", ") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
