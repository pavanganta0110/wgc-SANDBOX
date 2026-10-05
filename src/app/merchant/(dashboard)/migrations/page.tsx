import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { listMigrationJobs } from "@/lib/migrations/migrationEngine";
import { MIGRATION_ENTITY_LABELS, MIGRATION_SOURCE_LABELS, type MigrationEntityType, type MigrationSourceSystem } from "@/lib/migrations/types";
import NewMigrationJobButton from "@/components/merchant/NewMigrationJobButton";

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-700",
  MAPPING: "bg-slate-100 text-slate-700",
  READY: "bg-blue-100 text-blue-700",
  IMPORTING: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  COMPLETED_WITH_ERRORS: "bg-amber-100 text-amber-700",
  FAILED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-500",
};

export default async function MigrationCenterPage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageMigrations")) redirect("/merchant/dashboard");

  const jobs = await listMigrationJobs(auth.churchId);

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Migration Center</h2>
          <p className="mt-1 text-sm text-gray-500">
            Bring your donors, donation history, and funds over from another system — CSV files today, direct connections coming soon.
          </p>
        </div>
        <NewMigrationJobButton />
      </div>

      {jobs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
          No migrations started yet. Click &ldquo;New Migration&rdquo; to bring in data from a CSV export.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Source</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Contains</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Progress</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {jobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    <Link href={`/merchant/migrations/${j.id}`} className="font-semibold text-indigo-600 hover:underline">
                      {MIGRATION_SOURCE_LABELS[j.sourceSystem as MigrationSourceSystem] ?? j.sourceSystem}
                    </Link>
                    {j.fileName && <div className="text-xs text-slate-400">{j.fileName}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {j.entityTypes.map((t: MigrationEntityType) => MIGRATION_ENTITY_LABELS[t]).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[j.status] ?? "bg-slate-100 text-slate-700"}`}>
                      {j.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {j.totalRecords > 0 ? `${j.processedRecords} / ${j.totalRecords}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{new Date(j.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
