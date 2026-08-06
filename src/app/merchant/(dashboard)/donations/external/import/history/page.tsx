import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

const PAGE_SIZE = 25;

const STATUS_STYLES: Record<string, string> = {
  UPLOADED: "bg-slate-100 text-slate-600",
  VALIDATING: "bg-slate-100 text-slate-600",
  READY: "bg-slate-100 text-slate-600",
  IMPORTING: "bg-amber-50 text-amber-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  COMPLETED_WITH_ERRORS: "bg-amber-50 text-amber-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-600",
};

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  VALIDATING: "Validating",
  READY: "Ready",
  IMPORTING: "Importing",
  COMPLETED: "Completed",
  COMPLETED_WITH_ERRORS: "Completed with errors",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export default async function ImportHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canImportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donations/external");
    throw err;
  }

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);

  const [batches, totalCount] = await Promise.all([
    prisma.externalDonationImportBatch.findMany({
      where: { churchId: auth.churchId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.externalDonationImportBatch.count({ where: { churchId: auth.churchId } }),
  ]);

  const userIds = [...new Set(batches.map((b) => b.uploadedByUserId).filter((id): id is string => Boolean(id)))];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true } })
    : [];
  const userEmailById = new Map(users.map((u) => [u.id, u.email]));

  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Link href="/merchant/donations/external" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
        ← External Donations
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Import History</h1>
      <p className="text-sm text-slate-500 mb-6">Every CSV file your organization has uploaded to import external donations, and what happened to each row.</p>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">File</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="text-left px-6 py-3 font-medium">Rows</th>
              <th className="text-left px-6 py-3 font-medium">Amount imported</th>
              <th className="text-left px-6 py-3 font-medium">Uploaded by</th>
              <th className="text-left px-6 py-3 font-medium">Uploaded</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {batches.map((batch) => (
              <tr key={batch.id} className="hover:bg-slate-50">
                <td className="px-6 py-3 font-medium text-slate-800">{batch.fileName}</td>
                <td className="px-6 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[batch.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABELS[batch.status] ?? batch.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {batch.successRows} imported
                  {batch.failedRows > 0 && <span className="text-red-600"> · {batch.failedRows} failed</span>}
                  {batch.skippedRows > 0 && <span className="text-slate-400"> · {batch.skippedRows} skipped</span>}
                  {" "}/ {batch.totalRows} total
                </td>
                <td className="px-6 py-3 text-slate-600">{formatCents(batch.totalAmountCents)}</td>
                <td className="px-6 py-3 text-slate-500">{(batch.uploadedByUserId && userEmailById.get(batch.uploadedByUserId)) || "—"}</td>
                <td className="px-6 py-3 text-slate-500">{new Date(batch.createdAt).toLocaleString()}</td>
                <td className="px-6 py-3 text-right">
                  <Link href={`/merchant/donations/external/import/history/${batch.id}`} className="text-blue-600 hover:underline font-medium">
                    View
                  </Link>
                </td>
              </tr>
            ))}
            {batches.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-slate-400">
                  No imports yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100 text-sm text-slate-500">
            <span>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 && (
                  <Link href={`?page=${page - 1}`} className="px-2 py-1 rounded hover:bg-slate-100">
                    Previous
                  </Link>
                )}
                {page < pageCount && (
                  <Link href={`?page=${page + 1}`} className="px-2 py-1 rounded hover:bg-slate-100">
                    Next
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
