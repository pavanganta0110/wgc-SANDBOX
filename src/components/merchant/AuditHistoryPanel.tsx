"use client";

import { useEffect, useState, useCallback } from "react";

interface AuditLog {
  id: string;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

function formatAction(action: string): string {
  return action
    .split(".")
    .pop()!
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function AuditHistoryPanel() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 25;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/merchant/settings/audit?page=${p}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPage(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(1);
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-red-600 flex items-center gap-2">
        Failed to load audit history.
        <button onClick={() => load(page)} className="font-semibold text-blue-600 hover:underline">Retry</button>
      </div>
    );
  }

  if (logs.length === 0) {
    return <p className="text-sm text-slate-500 py-6 text-center">No changes recorded yet.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4">Action</th>
              <th className="py-2 pr-4">By</th>
              <th className="py-2 pr-4">When</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-b border-slate-50">
                <td className="py-2 pr-4 text-slate-900 font-medium">{formatAction(log.action)}</td>
                <td className="py-2 pr-4 text-slate-600">
                  {log.actorEmail || "System"}
                  {log.actorRole === "wgc_admin" && <span className="ml-1 text-xs text-slate-400">(WGC Support)</span>}
                </td>
                <td className="py-2 pr-4 text-slate-500">{new Date(log.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
        <span>
          Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
        </span>
        <div className="flex gap-2">
          <button onClick={() => load(page - 1)} disabled={page <= 1} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
          <button onClick={() => load(page + 1)} disabled={page * pageSize >= total} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}
