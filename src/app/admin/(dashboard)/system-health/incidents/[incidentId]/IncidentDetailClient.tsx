"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface TimelineEntry {
  at: string;
  type: "CREATED" | "ALERT_SENT" | "RESOLVED";
  severity: string;
  detail: string;
}

interface RelatedEvent {
  id: string;
  createdAt: string;
  operation: string | null;
  status: string;
  severity: string;
  merchantId: string | null;
  message: string;
  requestId: string | null;
  wgcReference: string | null;
}

interface AlertRow {
  id: string;
  severity: string;
  channel: string;
  notificationType: string;
  recipient: string | null;
  deliveryStatus: string;
  failureReason: string | null;
  sentAt: string;
}

interface IncidentDetail {
  id: string;
  fingerprint: string;
  title: string;
  description: string | null;
  service: string;
  severity: string;
  status: string;
  startedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  affectedMerchantCount: number;
  affectedUserCount: number;
  sentryIssueUrl: string | null;
  sentryIssueUrls: string[];
  notes: string | null;
  timeline: TimelineEntry[];
  errorGroups: { id: string; message: string; severity: string; status: string; occurrenceCount: number; lastSeenAt: string }[];
  relatedEvents: RelatedEvent[];
  relatedJobs: string[];
  affectedMerchants: { id: string; name: string }[];
  alerts: AlertRow[];
}

const MANUAL_STATUSES = ["OPEN", "INVESTIGATING", "MONITORING", "RESOLVED", "IGNORED"];

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleString() : "—";
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

export default function IncidentDetailClient({ incidentId }: { incidentId: string }) {
  const [data, setData] = useState<IncidentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/admin/system-health/incidents/${incidentId}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => {
        if (d) {
          setData(d);
          setNotesDraft(d.notes ?? "");
        }
      })
      .catch(() => toast.error("Failed to load incident detail"))
      .finally(() => setLoading(false));
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  const updateStatus = async (status: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/system-health/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to update status");
      toast.success(`Status set to ${status}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setSaving(false);
    }
  };

  const saveNotes = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/system-health/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesDraft }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Failed to save notes");
      toast.success("Notes saved");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save notes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link href="/admin/system-health/incidents" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        &larr; All Incidents
      </Link>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {notFound && <p className="text-sm text-slate-400">Incident not found.</p>}

      {data && (
        <>
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-xl font-bold text-slate-900 max-w-2xl">{data.title}</h1>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <StateBadge state={data.severity} />
              <StateBadge state={data.status} />
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            {data.service} &middot; fingerprint <span className="font-mono text-xs">{data.fingerprint}</span>
          </p>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <Field label="Started" value={fmtDate(data.startedAt)} />
            <Field label="Last Seen" value={fmtDate(data.lastSeenAt)} />
            <Field label="Resolved" value={fmtDate(data.resolvedAt)} />
            <Field label="Occurrences" value={data.occurrenceCount} />
            <Field label="Affected Merchants" value={data.affectedMerchantCount === 0 ? "0 (global incident, no specific merchant evidence)" : data.affectedMerchants.map((m) => m.name).join(", ")} />
            <Field label="Affected Users" value={data.affectedUserCount} />
            {data.relatedJobs.length > 0 && <Field label="Related Jobs" value={data.relatedJobs.join(", ")} />}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-8">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">Set status:</span>
            {MANUAL_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => updateStatus(s)}
                disabled={saving || s === data.status}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  s === data.status ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                } disabled:opacity-50`}
              >
                {s}
              </button>
            ))}
            {data.sentryIssueUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto px-4 py-2 rounded-full bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
              >
                View in Sentry &rarr;
              </a>
            ))}
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Timeline</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-8">
            <ul className="space-y-3">
              {data.timeline.map((t, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="text-xs text-slate-400 w-40 shrink-0">{fmtDate(t.at)}</span>
                  <StateBadge state={t.severity} />
                  <span className="text-slate-700">{t.detail}</span>
                </li>
              ))}
              {data.timeline.length === 0 && <li className="text-sm text-slate-400">No timeline events yet.</li>}
            </ul>
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Alerts Sent</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Channel</th>
                  <th className="text-left px-4 py-2">Recipient</th>
                  <th className="text-left px-4 py-2">Delivery</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(a.sentAt)}</td>
                    <td className="px-4 py-2 text-slate-500">{a.notificationType}</td>
                    <td className="px-4 py-2 text-slate-500">{a.channel}</td>
                    <td className="px-4 py-2 text-slate-500">{a.recipient ?? "—"}</td>
                    <td className="px-4 py-2">
                      <StateBadge state={a.deliveryStatus} />
                      {a.deliveryStatus === "FAILED" && a.failureReason && <span className="ml-2 text-xs text-slate-400">{a.failureReason}</span>}
                    </td>
                  </tr>
                ))}
                {data.alerts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No alerts sent for this incident yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Related Errors</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Message</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Occurrences</th>
                  <th className="text-left px-4 py-2">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.errorGroups.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-2 text-slate-700 max-w-[320px] truncate">
                      <Link href={`/admin/system-health/errors/${g.id}`} className="hover:underline">
                        {g.message}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <StateBadge state={g.severity} />
                    </td>
                    <td className="px-4 py-2">
                      <StateBadge state={g.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-500">{g.occurrenceCount}</td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(g.lastSeenAt)}</td>
                  </tr>
                ))}
                {data.errorGroups.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No related error groups.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Internal Notes</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <textarea
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              rows={4}
              placeholder="Add internal context for other admins — root cause, mitigation steps taken, follow-ups…"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm mb-3"
            />
            <button
              onClick={saveNotes}
              disabled={saving}
              className="px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
            >
              Save Notes
            </button>
          </div>
        </>
      )}
    </div>
  );
}
