import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { getRecurringImportReport, getRecurringJobProgress } from "@/lib/migrations/recurringImportRun";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import RecurringJobRunner from "@/components/admin/RecurringJobRunner";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  IMPORTED: "bg-green-50 text-green-700",
  VALID: "bg-blue-50 text-blue-700",
  WARNING: "bg-blue-50 text-blue-700",
  IMPORTING: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  NEEDS_REVIEW: "bg-red-50 text-red-700",
  INVALID: "bg-red-50 text-red-700",
  DUPLICATE: "bg-slate-100 text-slate-600",
  ROLLED_BACK: "bg-slate-100 text-slate-600",
};

export default async function RecurringJobPage({ params, searchParams }: { params: Promise<{ churchId: string; jobId: string }>; searchParams: Promise<{ autostart?: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { churchId, jobId } = await params;
  const { autostart } = await searchParams;

  const [report, progress] = await Promise.all([getRecurringImportReport(jobId, churchId), getRecurringJobProgress(jobId, churchId)]);
  if (!report || !progress) notFound();
  const canRun = session.role === "wgc_super_admin";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/admin/merchants/${churchId}/migration`} className="text-sm text-blue-600 hover:underline">
            &larr; All imports
          </Link>
          <h2 className="mt-1 text-lg font-medium">Recurring import {report.job.fileName ? `· ${report.job.fileName}` : ""}</h2>
        </div>
        <a href={`/api/admin/merchants/${churchId}/migration/recurring/${jobId}?format=csv`} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700">
          Download report (CSV)
        </a>
      </div>

      {canRun ? (
        <RecurringJobRunner churchId={churchId} jobId={jobId} initial={progress} autostart={autostart === "1"} />
      ) : (
        <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Status: {progress.status.replace(/_/g, " ").toLowerCase()}. Only a WGC super admin can run or cancel an import.</p>
      )}

      <div className="max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500">
            <tr>
              {["Row", "Status", "Customer", "Donor", "Amount", "Frequency", "First charge", "Finix IDs", "Notes"].map((h) => (
                <th key={h} className="px-3 py-2 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.rowNumber} className="border-t border-slate-100 align-top">
                <td className="px-3 py-2">{r.rowNumber}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 font-semibold ${BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{r.externalCustomerId}</td>
                <td className="px-3 py-2">{r.donorName || "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.amountCents == null ? "—" : `$${(r.amountCents / 100).toFixed(2)}`}</td>
                <td className="px-3 py-2">{r.frequency ? r.frequency.toLowerCase() : "—"}</td>
                <td className="px-3 py-2 tabular-nums">{r.nextChargeDate || "—"}</td>
                <td className="space-y-1 px-3 py-2">
                  {r.finixIdentityId && (
                    <div className="flex items-center gap-1">
                      ID <CopyableIdBadge id={r.finixIdentityId} label={r.finixIdentityId} variant="link" />
                    </div>
                  )}
                  {r.finixInstrumentId && (
                    <div className="flex items-center gap-1">
                      PI <CopyableIdBadge id={r.finixInstrumentId} label={r.finixInstrumentId} variant="link" />
                    </div>
                  )}
                  {r.finixSubscriptionId && (
                    <div className="flex items-center gap-1">
                      SUB <CopyableIdBadge id={r.finixSubscriptionId} label={r.finixSubscriptionId} variant="link" />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
