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
}

const OVERALL_STATUS_STYLE: Record<Overview["overallStatus"], { label: string; className: string }> = {
  OPERATIONAL: { label: "Operational", className: "bg-green-50 text-green-800 border-green-200" },
  DEGRADED: { label: "Degraded", className: "bg-amber-50 text-amber-800 border-amber-200" },
  MAJOR_ISSUE: { label: "Major Issue", className: "bg-red-50 text-red-800 border-red-200" },
};

function StatCard({ label, value, sublabel, unknown }: { label: string; value: string | number; sublabel?: string; unknown?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${unknown ? "text-slate-300" : "text-slate-900"}`}>{value}</p>
      {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  );
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
    fetch("/api/admin/system-health/overview")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => toast.error("Failed to load System Health overview"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">System Health</h1>
        <Link href="/admin/system-health/errors" className="px-4 py-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          View Errors
        </Link>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        The operational command center for the WGC platform — what&apos;s broken, for which merchants, and since when. Technical exception detail
        (stack traces, source maps) lives in Sentry; this page is what&apos;s broken operationally.
      </p>

      {loading && <p className="text-sm text-slate-400 mb-6">Loading…</p>}

      {data && (
        <>
          <div className={`rounded-2xl border px-5 py-4 mb-6 flex items-center justify-between ${OVERALL_STATUS_STYLE[data.overallStatus].className}`}>
            <span className="text-lg font-bold">Overall Status: {OVERALL_STATUS_STYLE[data.overallStatus].label}</span>
            {data.lastDeployment && (
              <span className="text-xs font-medium opacity-80">
                Deployed {data.lastDeployment.commitSha?.slice(0, 7)}
                {data.lastDeployment.commitRef ? ` (${data.lastDeployment.commitRef})` : ""}
                {data.lastDeployment.environment ? ` — ${data.lastDeployment.environment}` : ""}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Active Incidents" value={data.activeIncidents} />
            <StatCard label="Active Errors" value={data.activeErrors} />
            <StatCard label="Affected Merchants" value={data.affectedMerchants} />
            <StatCard label="Failed Jobs" value={data.failedJobs ?? "Unknown"} unknown={data.failedJobs == null} sublabel={data.failedJobs == null ? "No job-run history yet" : undefined} />
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
