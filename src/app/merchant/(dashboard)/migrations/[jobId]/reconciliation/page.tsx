import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { getMigrationReconciliation } from "@/lib/migrations/migrationEngine";
import { MIGRATION_ENTITY_LABELS, type MigrationEntityType } from "@/lib/migrations/types";

export default async function MigrationReconciliationPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageMigrations")) redirect("/merchant/dashboard");

  const report = await getMigrationReconciliation(jobId, auth.churchId);
  if (!report) notFound();

  const entityTypes = Object.keys(report.errorsByEntityType) as MigrationEntityType[];

  return (
    <div className="max-w-3xl">
      <Link href={`/merchant/migrations/${jobId}`} className="text-sm text-indigo-600 hover:underline">
        &larr; Back to migration
      </Link>
      <h2 className="mt-2 mb-1 text-lg font-medium">Reconciliation Report</h2>
      <p className="mb-6 text-sm text-slate-500">
        {report.job.succeededRecords} of {report.job.totalRecords} records imported successfully
        {report.job.failedRecords > 0 && `, ${report.job.failedRecords} failed`}.
      </p>

      {entityTypes.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">No errors were recorded for this migration.</div>
      ) : (
        entityTypes.map((entityType) => (
          <div key={entityType} className="mb-6 rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">{MIGRATION_ENTITY_LABELS[entityType] ?? entityType}</div>
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Row</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {report.errorsByEntityType[entityType].map((e) => (
                  <tr key={`${entityType}-${e.rowNumber}`}>
                    <td className="px-4 py-2 text-slate-500">{e.rowNumber}</td>
                    <td className="px-4 py-2 text-rose-600">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}
    </div>
  );
}
