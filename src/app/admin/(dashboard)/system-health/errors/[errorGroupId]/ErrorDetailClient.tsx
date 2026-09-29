"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface RecentEvent {
  id: string;
  createdAt: string;
  status: string;
  severity: string;
  merchantId: string | null;
  userId: string | null;
  requestId: string | null;
  externalId: string | null;
  wgcReference: string | null;
  release: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
}

interface ErrorDetail {
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
  sentryIssueUrl: string | null;
  notes: string | null;
  incident: { id: string; title: string; status: string; severity: string } | null;
  affectedMerchants: { id: string; name: string }[];
  affectedUserCount: number;
  recentEvents: RecentEvent[];
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleString();
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <div className="text-sm text-slate-900 mt-0.5">{value}</div>
    </div>
  );
}

export default function ErrorDetailClient({ errorGroupId }: { errorGroupId: string }) {
  const [data, setData] = useState<ErrorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/system-health/errors/${errorGroupId}`)
      .then((r) => {
        if (r.status === 404) {
          setNotFound(true);
          return null;
        }
        return r.json();
      })
      .then((d) => d && setData(d))
      .catch(() => toast.error("Failed to load error detail"))
      .finally(() => setLoading(false));
  }, [errorGroupId]);

  const latestEvent = data?.recentEvents[0];

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link href="/admin/system-health/errors" className="text-sm text-indigo-600 hover:underline mb-4 inline-block">
        &larr; All Errors
      </Link>

      {loading && <p className="text-sm text-slate-400">Loading…</p>}
      {notFound && <p className="text-sm text-slate-400">Error group not found.</p>}

      {data && (
        <>
          <div className="flex items-start justify-between mb-1">
            <h1 className="text-xl font-bold text-slate-900 max-w-2xl">{data.message}</h1>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <StateBadge state={data.severity} />
              <StateBadge state={data.status} />
            </div>
          </div>
          <p className="text-sm text-slate-500 mb-6">
            {data.service}
            {data.integration ? ` / ${data.integration}` : ""}
            {data.route ? ` — ${data.route}` : ""}
          </p>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 grid grid-cols-2 sm:grid-cols-3 gap-6 mb-6">
            <Field label="First Seen" value={fmtDate(data.firstSeenAt)} />
            <Field label="Last Seen" value={fmtDate(data.lastSeenAt)} />
            <Field label="Occurrences" value={data.occurrenceCount} />
            <Field label="Affected Merchants" value={data.affectedMerchants.length === 0 ? "0" : data.affectedMerchants.map((m) => m.name).join(", ")} />
            <Field label="Affected Users" value={data.affectedUserCount} />
            <Field label="Related Incident" value={data.incident ? <Link href={`/admin/system-health/incidents/${data.incident.id}`} className="text-indigo-600 hover:underline">{data.incident.title}</Link> : "None"} />
            <Field label="Latest Request ID" value={latestEvent?.requestId ? <span className="font-mono text-xs">{latestEvent.requestId}</span> : "—"} />
            <Field label="WGC Reference" value={latestEvent?.wgcReference ? <span className="font-mono text-xs">{latestEvent.wgcReference}</span> : "—"} />
            <Field label="Release / Deployment" value={latestEvent?.release ? <span className="font-mono text-xs">{latestEvent.release.slice(0, 7)}</span> : "Unknown"} />
          </div>

          {data.sentryIssueUrl && (
            <a
              href={data.sentryIssueUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 mb-6"
            >
              View Technical Error in Sentry &rarr;
            </a>
          )}

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Recent Occurrences</h2>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2">When</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Merchant</th>
                  <th className="text-left px-4 py-2">Request ID</th>
                  <th className="text-left px-4 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-2">
                      <StateBadge state={e.status} />
                    </td>
                    <td className="px-4 py-2 text-slate-500">{e.merchantId ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{e.requestId ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{e.wgcReference ?? "—"}</td>
                  </tr>
                ))}
                {data.recentEvents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">
                      No occurrences recorded.
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
