"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface ErrorGroupRow {
  id: string;
  service: string;
  integration: string | null;
  route: string | null;
  severity: string;
  status: string;
  message: string;
  firstSeenAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  affectedMerchantCount: number;
  affectedUserCount: number;
  latestRequestId: string | null;
  incidentId: string | null;
}

const SEVERITIES = ["INFO", "WARNING", "ERROR", "CRITICAL"];
const STATUSES = ["OPEN", "RESOLVED", "IGNORED"];

function fmtDate(d: string): string {
  return new Date(d).toLocaleString();
}

export default function ErrorsListClient() {
  const [rows, setRows] = useState<ErrorGroupRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [severity, setSeverity] = useState("");
  const [service, setService] = useState("");
  const [status, setStatus] = useState("OPEN");

  // Deliberately does not flip `loading` back to true on a filter-triggered
  // refetch (only the initial useState(true) shows the loading state) — the
  // table just updates in place once the new page of rows arrives, no
  // flicker. Setting state synchronously inside the effect that calls this
  // would also trip react-hooks/set-state-in-effect.
  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (severity) params.set("severity", severity);
    if (service) params.set("service", service);
    if (status) params.set("status", status);
    fetch(`/api/admin/system-health/errors?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.errorGroups))
      .catch(() => toast.error("Failed to load errors"))
      .finally(() => setLoading(false));
  }, [severity, service, status]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">System Health — Errors</h1>
        <Link href="/admin/system-health" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to Overview
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        One row per distinct problem (grouped by service, route, and message shape), not per occurrence — same idea as a Sentry Issue, but tracked
        independently of whether Sentry is connected.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 mb-6">
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
          placeholder="Filter by service (e.g. WGC API)"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm flex-1 min-w-[200px]"
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Severity</th>
              <th className="text-left px-4 py-2">Message</th>
              <th className="text-left px-4 py-2">Service</th>
              <th className="text-left px-4 py-2">Route</th>
              <th className="text-left px-4 py-2">First Seen</th>
              <th className="text-left px-4 py-2">Last Seen</th>
              <th className="text-left px-4 py-2">Occurrences</th>
              <th className="text-left px-4 py-2">Merchants</th>
              <th className="text-left px-4 py-2">Users</th>
              <th className="text-left px-4 py-2">Status</th>
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
                  No errors recorded yet.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">
                  <StateBadge state={r.severity} />
                </td>
                <td className="px-4 py-2 max-w-[280px] truncate font-medium text-slate-800">
                  <Link href={`/admin/system-health/errors/${r.id}`} className="hover:underline">
                    {r.message}
                  </Link>
                </td>
                <td className="px-4 py-2 text-slate-500">
                  {r.service}
                  {r.integration ? ` / ${r.integration}` : ""}
                </td>
                <td className="px-4 py-2 text-slate-500 max-w-[200px] truncate">{r.route ?? "—"}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.firstSeenAt)}</td>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.lastSeenAt)}</td>
                <td className="px-4 py-2 text-slate-500">{r.occurrenceCount}</td>
                <td className="px-4 py-2 text-slate-500">{r.affectedMerchantCount}</td>
                <td className="px-4 py-2 text-slate-500">{r.affectedUserCount}</td>
                <td className="px-4 py-2">
                  <StateBadge state={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
