import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { getRecurringImportReport, getRecurringJobProgress } from "@/lib/migrations/recurringImportRun";

export const dynamic = "force-dynamic";

const BADGE: Record<string, string> = {
  IMPORTED: "bg-emerald-100 text-emerald-700",
  VALID: "bg-blue-100 text-blue-700",
  WARNING: "bg-blue-100 text-blue-700",
  IMPORTING: "bg-amber-100 text-amber-700",
  FAILED: "bg-rose-100 text-rose-700",
  NEEDS_REVIEW: "bg-rose-100 text-rose-700",
  INVALID: "bg-rose-100 text-rose-700",
  DUPLICATE: "bg-slate-100 text-slate-600",
  ROLLED_BACK: "bg-slate-100 text-slate-600",
};

/** Read-only: the merchant sees how the move of their recurring donors is going. WGC staff run the import. */
export default async function MerchantRecurringImportPage({ params }: { params: Promise<{ jobId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageMigrations")) redirect("/merchant/dashboard");
  const { jobId } = await params;

  const [report, progress] = await Promise.all([getRecurringImportReport(jobId, auth.churchId), getRecurringJobProgress(jobId, auth.churchId)]);
  if (!report || !progress) notFound();

  const stat = (label: string, n: number | undefined, cls = "text-slate-900") => (
    <div className="rounded-xl bg-slate-50 p-4">
      <div className={`text-2xl font-bold ${cls}`}>{n ?? 0}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );

  return (
    <div>
      <Link href="/merchant/migrations" className="text-sm text-indigo-600 hover:underline">
        &larr; Migration Center
      </Link>
      <h2 className="mt-2 text-lg font-medium">Recurring gifts from Continue to Give</h2>
      <p className="mt-1 text-sm text-gray-500">
        WGC is moving your recurring donors over. Each gift keeps its amount and schedule, and its first WGC charge is on the date in your file. Status: {progress.status.replace(/_/g, " ").toLowerCase()}.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stat("Moved over", progress.counts.IMPORTED, "text-emerald-700")}
        {stat("Waiting", progress.remaining, "text-blue-700")}
        {stat("Need attention", (progress.counts.FAILED ?? 0) + (progress.counts.NEEDS_REVIEW ?? 0), "text-rose-700")}
        {stat("Skipped (repeated or invalid)", (progress.counts.DUPLICATE ?? 0) + (progress.counts.INVALID ?? 0), "text-slate-600")}
        {stat("Canceled", progress.counts.ROLLED_BACK)}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              {["Donor", "Amount", "Frequency", "First WGC charge", "Fund", "Status", "Notes"].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {report.rows.map((r) => (
              <tr key={r.rowNumber}>
                <td className="px-4 py-3">{r.donorName || r.externalCustomerId}</td>
                <td className="px-4 py-3 tabular-nums">{r.amountCents == null ? "—" : `$${(r.amountCents / 100).toFixed(2)}`}</td>
                <td className="px-4 py-3">{r.frequency ? r.frequency.toLowerCase() : "—"}</td>
                <td className="px-4 py-3 tabular-nums">{r.nextChargeDate || "—"}</td>
                <td className="px-4 py-3">{r.fundName || "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[r.status] ?? "bg-slate-100 text-slate-700"}`}>{r.status.replace(/_/g, " ").toLowerCase()}</span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
