import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { RECURRING_SOURCE_SYSTEM } from "@/lib/migrations/recurringImport";
import RecurringImportWizard from "@/components/admin/RecurringImportWizard";
import { listScheduleSubmissions } from "@/lib/migrations/recurringSubmission";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  READY: "bg-blue-50 text-blue-700",
  IMPORTING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-green-50 text-green-700",
  COMPLETED_WITH_ERRORS: "bg-amber-50 text-amber-700",
  CANCELLED: "bg-slate-100 text-slate-600",
  FAILED: "bg-red-50 text-red-700",
};

/** WGC staff tool: move a merchant's recurring donors from another giving platform (first case Continue to Give). */
export default async function MerchantMigrationPage({ params }: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const { churchId } = await params;

  const [church, jobs, submissions] = await Promise.all([
    prisma.church.findUnique({ where: { id: churchId }, select: { name: true, finixMerchantId: true, status: true } }),
    prisma.migrationJob.findMany({ where: { churchId, sourceSystem: RECURRING_SOURCE_SYSTEM, status: { notIn: ["SUBMITTED", "SUBMISSION_USED"] } }, orderBy: { createdAt: "desc" }, take: 20 }),
    listScheduleSubmissions(churchId),
  ]);
  const canRun = session.role === "wgc_super_admin";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Recurring migration</h2>
        <p className="mt-1 text-sm text-gray-500">
          Move {church?.name ?? "this organization"}&rsquo;s recurring donors from Continue to Give. Finix imports the saved cards and bank accounts and sends back a mapping file; this tool creates each recurring gift from that file and the schedule file.
          Card and bank numbers never pass through WGC.
        </p>
      </div>

      {!church?.finixMerchantId && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">This organization has no Finix merchant yet. It must be approved and live before an import can run.</p>}
      {!canRun && <p className="rounded-lg bg-slate-100 p-3 text-sm text-slate-700">Only a WGC super admin can run a recurring import. You can see the jobs below.</p>}

      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Import jobs</div>
        {jobs.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">No imports yet.</p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Created</th>
                <th className="px-5 py-2 font-semibold">File</th>
                <th className="px-5 py-2 font-semibold">Gifts</th>
                <th className="px-5 py-2 font-semibold">Status</th>
                <th className="px-5 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 text-slate-600">{j.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  <td className="px-5 py-3">{j.fileName || "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{j.succeededRecords} / {j.totalRecords}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[j.status] ?? "bg-slate-100 text-slate-600"}`}>{j.status.replace(/_/g, " ").toLowerCase()}</span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link href={`/admin/merchants/${churchId}/migration/${j.id}`} className="font-semibold text-blue-600 hover:underline">Open</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {submissions.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Files from the merchant</div>
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Sent</th>
                <th className="px-5 py-2 font-semibold">File</th>
                <th className="px-5 py-2 font-semibold">Gifts</th>
                <th className="px-5 py-2 font-semibold">Sent by</th>
                <th className="px-5 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="px-5 py-3 text-slate-600">{s.createdAt.toISOString().slice(0, 16).replace("T", " ")} UTC</td>
                  <td className="px-5 py-3">{s.fileName || "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{s.rowCount}</td>
                  <td className="px-5 py-3 text-slate-600">{s.submittedByEmail || "—"}</td>
                  <td className="px-5 py-3">{s.usedByJobId ? <Link href={`/admin/merchants/${churchId}/migration/${s.usedByJobId}`} className="font-semibold text-blue-600 hover:underline">Used in an import</Link> : <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">New</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canRun && church?.finixMerchantId && (
        <div>
          <h3 className="mb-3 text-base font-semibold">New recurring import</h3>
          <RecurringImportWizard churchId={churchId} submissions={submissions.filter((x) => !x.usedByJobId).map((x) => ({ id: x.id, fileName: x.fileName, rowCount: x.rowCount }))} />
        </div>
      )}
    </div>
  );
}
