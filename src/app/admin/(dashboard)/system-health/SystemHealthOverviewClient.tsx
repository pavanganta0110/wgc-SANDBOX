"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import StateBadge from "@/components/merchant/StateBadge";

interface ServiceStatus {
  service: string;
  status: "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "UNKNOWN";
  recentFailureCount: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  note: string;
}

interface ActiveIssue {
  id: string;
  title: string;
  service: string;
  severity: string;
  status: string;
  startedAt: string;
  lastSeenAt: string;
  occurrenceCount: number;
  affectedMerchantCount: number;
}

interface CheckoutThroughput {
  attemptsLast5Min: number;
  attemptsLastHour: number;
  succeededLastHour: number;
  failedLastHour: number;
  successRatePercent: number | null;
}

interface ActiveUsersNow {
  admins: number;
  merchantStaff: number;
  total: number;
}

interface Overview {
  overallStatus: "OPERATIONAL" | "DEGRADED" | "MAJOR_ISSUE";
  activeErrors: number;
  activeIncidents: number;
  affectedMerchants: number;
  failedJobs: number | null;
  failedWebhooks: number | null;
  apiErrorRatePercent: number | null;
  averageApiResponseTimeMs: number | null;
  lastDeployment: { commitSha: string | null; commitMessage: string | null; commitRef: string | null; environment: string | null } | null;
  services: ServiceStatus[];
  activeIssues: ActiveIssue[];
  checkoutThroughput: CheckoutThroughput;
  activeUsersNow: ActiveUsersNow;
}

const OVERALL_STATUS_STYLE: Record<Overview["overallStatus"], { label: string; className: string }> = {
  OPERATIONAL: { label: "Operational", className: "bg-green-50 text-green-800 border-green-200" },
  DEGRADED: { label: "Degraded", className: "bg-amber-50 text-amber-800 border-amber-200" },
  MAJOR_ISSUE: { label: "Major Issue", className: "bg-red-50 text-red-800 border-red-200" },
};

function StatCard({ label, value, sublabel, unknown, href }: { label: string; value: string | number; sublabel?: string; unknown?: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${unknown ? "text-slate-300" : "text-slate-900"}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </>
  );
  if (href) {
    return (
      <Link href={href} className="block bg-white border border-slate-200 rounded-xl p-5 hover:border-slate-300 hover:shadow-sm transition-shadow">
        {body}
      </Link>
    );
  }
  return <div className="bg-white border border-slate-200 rounded-xl p-5">{body}</div>;
}

function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleString() : "—";
}

function ServiceCard({ service }: { service: ServiceStatus }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold text-slate-900">{service.service}</h3>
        <StateBadge state={service.status} />
      </div>
      <p className="text-xs text-slate-500 mb-3">{service.note}</p>
      {service.status !== "UNKNOWN" && (
        <div className="grid grid-cols-2 gap-2 text-xs text-slate-400">
          <div>
            <p className="font-semibold text-slate-500">Last failure</p>
            <p>{fmtDate(service.lastFailureAt)}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-500">Last success</p>
            <p>{fmtDate(service.lastSuccessAt)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SystemHealthOverviewClient() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () =>
      fetch("/api/admin/system-health/overview")
        .then((r) => r.json())
        .then((d) => setData(d))
        .catch(() => toast.error("Failed to load System Health overview"))
        .finally(() => setLoading(false));

    load();
    // Refreshes "Active Now" (and everything else on this page) every 30s
    // without a manual reload — a short enough interval to feel live, long
    // enough to stay cheap even with this page open in a background tab.
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
        <div className="flex gap-2">
          <Link href="/admin/system-health/errors" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Errors
          </Link>
          <Link href="/admin/system-health/incidents" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Incidents
          </Link>
          <Link href="/admin/system-health/jobs" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Background Jobs
          </Link>
          <Link href="/admin/system-health/alerts" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Alert History
          </Link>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        The operational command center for the WGC platform — what&apos;s broken, for which merchants, and since when. Technical exception detail
        (stack traces, source maps) lives in Sentry; this page is what&apos;s broken operationally.
      </p>

      {loading && <p className="text-sm text-slate-400 mb-6">Loading…</p>}

      {data && (
        <>
          <div className={`rounded-2xl border px-5 py-4 mb-6 flex items-center justify-between flex-wrap gap-3 ${OVERALL_STATUS_STYLE[data.overallStatus].className}`}>
            <span className="text-lg font-bold">Overall Status: {OVERALL_STATUS_STYLE[data.overallStatus].label}</span>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/60 text-xs font-semibold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-current"></span>
                </span>
                {data.activeUsersNow.total} active now
              </span>
              {data.lastDeployment && (
                <span className="text-xs font-medium opacity-80">
                  Deployed {data.lastDeployment.commitSha?.slice(0, 7)}
                  {data.lastDeployment.commitRef ? ` (${data.lastDeployment.commitRef})` : ""}
                  {data.lastDeployment.environment ? ` — ${data.lastDeployment.environment}` : ""}
                </span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 mb-8 flex items-center gap-8 flex-wrap">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Active Now</p>
              <p className="text-2xl font-bold text-slate-900">{data.activeUsersNow.total}</p>
              <p className="text-xs text-slate-400">Logged-in users active in the last 5 minutes</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">WGC Admins</p>
              <p className="text-2xl font-bold text-slate-900">{data.activeUsersNow.admins}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Merchant Staff</p>
              <p className="text-2xl font-bold text-slate-900">{data.activeUsersNow.merchantStaff}</p>
            </div>
            <p className="text-xs text-slate-400 ml-auto max-w-sm">
              Counts real logged-in accounts only (merchants + WGC admins). Anonymous donor traffic on public giving pages is tracked separately
              in Vercel Analytics.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Active Incidents" value={data.activeIncidents} href="/admin/system-health/incidents" />
            <StatCard label="Active Errors" value={data.activeErrors} href="/admin/system-health/errors" />
            <StatCard label="Affected Merchants" value={data.affectedMerchants} />
            <StatCard
              label="Failed Jobs"
              value={data.failedJobs ?? "Unknown"}
              unknown={data.failedJobs == null}
              sublabel={data.failedJobs == null ? "No job-run history yet" : "Actively-scheduled jobs currently unhealthy"}
              href="/admin/system-health/jobs"
            />
            <StatCard label="Failed Webhooks" value={data.failedWebhooks ?? "Unknown"} unknown={data.failedWebhooks == null} sublabel={data.failedWebhooks == null ? "No webhook data yet" : "Last 24h"} />
            <StatCard
              label="API Error Rate"
              value={data.apiErrorRatePercent != null ? `${data.apiErrorRatePercent}%` : "Unknown"}
              unknown={data.apiErrorRatePercent == null}
              sublabel="Partner API, last 24h"
            />
            <StatCard
              label="Avg Response Time (Partner API)"
              value={data.averageApiResponseTimeMs != null ? `${data.averageApiResponseTimeMs}ms` : "Unknown"}
              unknown={data.averageApiResponseTimeMs == null}
              sublabel={data.averageApiResponseTimeMs != null ? "Partner API, last 24h" : "No duration data recorded yet"}
            />
            <StatCard label="Last Deployment" value={data.lastDeployment?.commitSha?.slice(0, 7) ?? "Unknown"} unknown={!data.lastDeployment} sublabel={data.lastDeployment?.commitMessage ?? undefined} />
          </div>

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Active Issues</h2>
            {data.activeIssues.length > 0 && (
              <Link href="/admin/system-health/incidents" className="text-xs font-semibold text-indigo-600 hover:underline">
                View all incidents &rarr;
              </Link>
            )}
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-8">
            {data.activeIssues.length === 0 ? (
              <p className="px-4 py-6 text-center text-slate-400 text-sm">No active issues — every service is operating normally.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Severity</th>
                    <th className="text-left px-4 py-2">Title</th>
                    <th className="text-left px-4 py-2">Service</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Started</th>
                    <th className="text-left px-4 py-2">Occurrences</th>
                    <th className="text-left px-4 py-2">Merchants</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.activeIssues.map((issue) => (
                    <tr key={issue.id}>
                      <td className="px-4 py-2">
                        <StateBadge state={issue.severity} />
                      </td>
                      <td className="px-4 py-2 max-w-[260px] truncate font-medium text-slate-800">
                        <Link href={`/admin/system-health/incidents/${issue.id}`} className="hover:underline">
                          {issue.title}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-500">{issue.service}</td>
                      <td className="px-4 py-2">
                        <StateBadge state={issue.status} />
                      </td>
                      <td className="px-4 py-2 text-slate-500">{fmtDate(issue.startedAt)}</td>
                      <td className="px-4 py-2 text-slate-500">{issue.occurrenceCount}</td>
                      <td className="px-4 py-2 text-slate-500">{issue.affectedMerchantCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Checkout Throughput</h2>
          <p className="text-xs text-slate-400 mb-3 -mt-2">
            Real donation/payment volume — the direct answer to &quot;if a lot of people check out at once, would we know.&quot; Read-only off the
            same records the checkout flow already writes; never a new load on checkout itself. Sitewide visitor traffic and page performance
            under load are tracked separately by Vercel Analytics / Speed Insights (see your Vercel dashboard), and database load by
            Supabase&apos;s own dashboard — neither duplicated here.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <StatCard label="Attempts (last 5 min)" value={data.checkoutThroughput.attemptsLast5Min} sublabel="Right now" />
            <StatCard label="Attempts (last hour)" value={data.checkoutThroughput.attemptsLastHour} />
            <StatCard label="Failed (last hour)" value={data.checkoutThroughput.failedLastHour} />
            <StatCard
              label="Success Rate (last hour)"
              value={data.checkoutThroughput.successRatePercent != null ? `${data.checkoutThroughput.successRatePercent}%` : "Unknown"}
              unknown={data.checkoutThroughput.successRatePercent == null}
              sublabel={data.checkoutThroughput.successRatePercent == null ? "No attempts in the last hour" : undefined}
            />
          </div>

          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">Services</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {data.services.map((s) => (
              <ServiceCard key={s.service} service={s} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
