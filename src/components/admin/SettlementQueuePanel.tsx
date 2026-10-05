"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";

interface QueueEntry {
  id: string;
  entity_id?: string;
  state?: string;
  ready_to_settle_at?: string;
  created_at?: string;
  [key: string]: unknown;
}

// Matches JS Date.getDay() — 0=Sunday..6=Saturday — and the cron job's own
// weekday computation (America/Chicago), so "Monday" here means Monday for
// the business, not whatever UTC day the cron happens to fire on.
const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

/**
 * WGC-super-admin-only settlement queue control: view a merchant's Finix
 * settlement_queue_mode, switch it on/off, and release queued entries
 * (single or bulk) into settlement. Fully self-contained — fetches its own
 * data client-side against /api/admin/merchants/[churchId]/settlement-queue
 * rather than being server-rendered, since every action here needs
 * interactivity anyway.
 */
export default function SettlementQueuePanel({ churchId, canManage }: { churchId: string; canManage: boolean }) {
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<string | null>(null);
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [autoReleaseWeekdays, setAutoReleaseWeekdays] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/settlement-queue`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load settlement queue");
      setMode(data.settlementQueueMode);
      setEntries(data.entries || []);
      setAutoReleaseWeekdays(data.autoReleaseWeekdays || []);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settlement queue");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [churchId]);

  const setQueueMode = async (nextMode: "MANUAL" | "UNSET") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/settlement-queue/mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: nextMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to change settlement queue mode");
      toast.success(nextMode === "MANUAL" ? "Settlement queue enabled for this merchant" : "Settlement queue disabled");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change settlement queue mode");
    } finally {
      setBusy(false);
    }
  };

  const releaseSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/settlement-queue/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to release entries");
      toast.success(`Released ${selected.size} entr${selected.size === 1 ? "y" : "ies"}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to release entries");
    } finally {
      setBusy(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const saveSchedule = async (nextWeekdays: number[]) => {
    setSavingSchedule(true);
    const previous = autoReleaseWeekdays;
    setAutoReleaseWeekdays(nextWeekdays); // optimistic — feels instant on a 7-button toggle
    try {
      const res = await fetch(`/api/admin/merchants/${churchId}/settlement-queue/auto-release-schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekdays: nextWeekdays }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update auto-release schedule");
    } catch (err) {
      setAutoReleaseWeekdays(previous);
      toast.error(err instanceof Error ? err.message : "Failed to update auto-release schedule");
    } finally {
      setSavingSchedule(false);
    }
  };

  const toggleWeekday = (day: number) => {
    const next = autoReleaseWeekdays.includes(day)
      ? autoReleaseWeekdays.filter((d) => d !== day)
      : [...autoReleaseWeekdays, day].sort((a, b) => a - b);
    saveSchedule(next);
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-8">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-medium">Settlement Queue</h2>
        {!loading && mode && (
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              mode === "MANUAL" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"
            }`}
          >
            {mode === "MANUAL" ? "Manual release enabled" : "Automatic (default)"}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Hold transactions out of settlement until explicitly released. Requires Finix support to have enabled
        Settlement Queue at the Application level — if mode changes fail below, that&apos;s the first thing to check.
      </p>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : (
        <>
          {canManage && (
            <div className="flex items-center gap-2 mb-4">
              {mode === "MANUAL" ? (
                <button
                  onClick={() => setQueueMode("UNSET")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Disable Manual Queue
                </button>
              ) : (
                <button
                  onClick={() => setQueueMode("MANUAL")}
                  disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-semibold hover:bg-gray-800 disabled:opacity-50"
                >
                  Enable Manual Queue
                </button>
              )}
            </div>
          )}

          {mode === "MANUAL" && (
            <>
              <div className="mb-6 pb-6 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-700 mb-1">Auto-release schedule</p>
                <p className="text-xs text-gray-500 mb-3">
                  On the days selected, every entry that&apos;s already past its ready-to-settle date gets released
                  automatically — pick one day for a weekly release, two for twice a week.
                  {!canManage && " (view only)"}
                </p>
                <div className="flex gap-1.5">
                  {WEEKDAYS.map((day) => {
                    const active = autoReleaseWeekdays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        onClick={() => canManage && toggleWeekday(day.value)}
                        disabled={!canManage || savingSchedule}
                        className={`w-11 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                          active
                            ? "bg-gray-900 text-white"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        } ${!canManage ? "cursor-default" : ""}`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {entries.length === 0 ? (
                <p className="text-sm text-gray-500">No entries currently waiting to be released.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {canManage && <th className="py-2 pr-3 w-8"></th>}
                        <th className="py-2 pr-3">Entry ID</th>
                        <th className="py-2 pr-3">Transaction</th>
                        <th className="py-2 pr-3">State</th>
                        <th className="py-2 pr-3">Ready to Settle</th>
                        <th className="py-2">Created</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          {canManage && (
                            <td className="py-2 pr-3">
                              <input
                                type="checkbox"
                                checked={selected.has(entry.id)}
                                onChange={() => toggleSelected(entry.id)}
                                disabled={busy}
                              />
                            </td>
                          )}
                          <td className="py-2 pr-3 font-mono text-xs text-gray-700">{entry.id}</td>
                          <td className="py-2 pr-3 font-mono text-xs text-gray-500">{entry.entity_id || "—"}</td>
                          <td className="py-2 pr-3 text-gray-600">{entry.state || "—"}</td>
                          <td className="py-2 pr-3 text-gray-600">
                            {entry.ready_to_settle_at ? formatDateTime(new Date(entry.ready_to_settle_at)) : "—"}
                          </td>
                          <td className="py-2 text-gray-600">
                            {entry.created_at ? formatDateTime(new Date(entry.created_at)) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {canManage && entries.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={releaseSelected}
                    disabled={busy || selected.size === 0}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy ? "Releasing…" : `Release Selected (${selected.size})`}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
