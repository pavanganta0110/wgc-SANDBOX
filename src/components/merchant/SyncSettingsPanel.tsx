"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface SyncEvent {
  id: string;
  entity: string | null;
  type: string;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
}

export default function SyncSettingsPanel({ canTriggerSync }: { canTriggerSync: boolean }) {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const pageSize = 25;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/merchant/settings/sync?page=${p}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setEvents(data.events);
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

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/merchant/settings/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sync failed");
      toast.success("Sync triggered");
      load(1);
    } catch (err: any) {
      toast.error(err.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      {canTriggerSync && (
        <div className="mb-4">
          <button onClick={triggerSync} disabled={syncing} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-50">
            {syncing ? "Syncing…" : "Sync Pricing Now"}
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 flex items-center gap-2">
          Failed to load sync history.
          <button onClick={() => load(page)} className="font-semibold text-blue-600 hover:underline">Retry</button>
        </div>
      ) : events.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No processor updates recorded yet.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4">Event</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Received</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-700">{event.entity || event.type}</td>
                    <td className="py-2 pr-4">
                      <StateBadge state={event.processingStatus} />
                      {event.errorMessage && <span className="ml-2 text-xs text-red-600">{event.errorMessage}</span>}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">{new Date(event.createdAt).toLocaleString()}</td>
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
        </>
      )}
    </div>
  );
}
