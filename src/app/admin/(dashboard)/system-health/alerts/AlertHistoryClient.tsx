"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface AlertRow {
  id: string;
  incidentId: string;
  incidentTitle: string;
  service: string;
  severity: string;
  channel: string;
  notificationType: string;
  recipient: string | null;
  deliveryStatus: string;
  providerMessageId: string | null;
  failureReason: string | null;
  sentAt: string;
}

const CHANNELS = ["DASHBOARD", "EMAIL", "SMS"];
const DELIVERY_STATUSES = ["SENT", "FAILED", "PENDING"];
const NOTIFICATION_TYPES = ["INITIAL", "ESCALATION", "REMINDER", "RECOVERY"];

function fmtDate(d: string): string {
  return new Date(d).toLocaleString();
}

export default function AlertHistoryClient() {
  const [rows, setRows] = useState<AlertRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [notificationType, setNotificationType] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (channel) params.set("channel", channel);
    if (deliveryStatus) params.set("deliveryStatus", deliveryStatus);
    if (notificationType) params.set("notificationType", notificationType);
    fetch(`/api/admin/system-health/alerts?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setRows(d.alerts))
      .catch(() => toast.error("Failed to load alert history"))
      .finally(() => setLoading(false));
  }, [channel, deliveryStatus, notificationType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">System Health — Alert History</h1>
        <Link href="/admin/system-health" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          Back to Overview
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Every notification actually sent or attempted for an incident — deduplicated by design (one initial alert, then only on escalation, a
        meaningful unresolved interval, or recovery), never one row per raw occurrence.
      </p>

      <div className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-3 mb-6">
        <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All channels</option>
          {CHANNELS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select value={deliveryStatus} onChange={(e) => setDeliveryStatus(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All delivery statuses</option>
          {DELIVERY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select value={notificationType} onChange={(e) => setNotificationType(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="">All notification types</option>
          {NOTIFICATION_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2">Sent At</th>
              <th className="text-left px-4 py-2">Incident</th>
              <th className="text-left px-4 py-2">Severity</th>
              <th className="text-left px-4 py-2">Type</th>
              <th className="text-left px-4 py-2">Channel</th>
              <th className="text-left px-4 py-2">Recipient</th>
              <th className="text-left px-4 py-2">Delivery</th>
              <th className="text-left px-4 py-2">Provider ID</th>
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
                  No alerts sent yet.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2 text-slate-500">{fmtDate(r.sentAt)}</td>
                <td className="px-4 py-2 max-w-[220px] truncate font-medium text-slate-800">
                  <Link href={`/admin/system-health/incidents/${r.incidentId}`} className="hover:underline">
                    {r.incidentTitle}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  <StateBadge state={r.severity} />
                </td>
                <td className="px-4 py-2 text-slate-500">{r.notificationType}</td>
                <td className="px-4 py-2 text-slate-500">{r.channel}</td>
                <td className="px-4 py-2 text-slate-500">{r.recipient ?? "—"}</td>
                <td className="px-4 py-2">
                  <StateBadge state={r.deliveryStatus} />
                  {r.deliveryStatus === "FAILED" && r.failureReason && <span className="ml-2 text-xs text-slate-400">{r.failureReason}</span>}
                </td>
                <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.providerMessageId ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
