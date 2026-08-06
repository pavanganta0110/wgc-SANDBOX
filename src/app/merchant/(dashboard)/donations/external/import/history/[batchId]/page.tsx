import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { requirePermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/format";

const ROW_STATUS_STYLES: Record<string, string> = {
  IMPORTED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  SKIPPED: "bg-slate-100 text-slate-600",
  DUPLICATE: "bg-amber-50 text-amber-700",
  INVALID: "bg-red-50 text-red-700",
  WARNING: "bg-amber-50 text-amber-700",
  VALID: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-slate-100 text-slate-600",
};

const DONOR_RESOLUTION_LABELS: Record<string, string> = {
  MATCHED_EXISTING: "Matched existing donor",
  CREATED_NEW: "Created new donor",
  AMBIGUOUS: "Ambiguous",
  ANONYMOUS: "Anonymous",
  UNMATCHED: "No donor",
};

function rawFieldSummary(rawDataJson: unknown): string {
  if (!rawDataJson || typeof rawDataJson !== "object") return "—";
  const data = rawDataJson as Record<string, unknown>;
  const first = typeof data.donorFirstName === "string" ? data.donorFirstName : "";
  const last = typeof data.donorLastName === "string" ? data.donorLastName : "";
  const name = `${first} ${last}`.trim();
  const email = typeof data.donorEmail === "string" ? data.donorEmail : "";
  if (name && email) return `${name} (${email})`;
  return name || email || "—";
}

export default async function ImportBatchDetailPage({ params }: { params: Promise<{ batchId: string }> }) {
  let auth;
  try {
    auth = await requireMerchantSession();
    requirePermission(auth, "canImportExternalDonations");
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/donations/external");
    throw err;
  }

  const { batchId } = await params;

  const batch = await prisma.externalDonationImportBatch.findFirst({
    where: { id: batchId, churchId: auth.churchId },
  });
  if (!batch) notFound();

  const rows = await prisma.externalDonationImportRow.findMany({
    where: { importBatchId: batch.id },
    orderBy: { rowNumber: "asc" },
  });

  const uploadedByEmail = batch.uploadedByUserId
    ? (await prisma.user.findUnique({ where: { id: batch.uploadedByUserId }, select: { email: true } }))?.email
    : null;

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link href="/merchant/donations/external/import/history" className="text-sm text-slate-500 hover:text-slate-700 mb-2 inline-block">
        ← Import History
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">{batch.fileName}</h1>
      <p className="text-sm text-slate-500 mb-6">
        Uploaded {new Date(batch.createdAt).toLocaleString()}
        {uploadedByEmail ? ` by ${uploadedByEmail}` : ""}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500 mb-1">Imported</p>
          <p className="text-xl font-bold text-emerald-600">{batch.successRows}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500 mb-1">Failed</p>
          <p className="text-xl font-bold text-red-600">{batch.failedRows}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500 mb-1">Skipped</p>
          <p className="text-xl font-bold text-slate-600">{batch.skippedRows}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-xs text-slate-500 mb-1">Total imported</p>
          <p className="text-xl font-bold text-slate-900">{formatCents(batch.totalAmountCents)}</p>
        </div>
      </div>

      {batch.receiptOption && batch.receiptOption !== "NONE" && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-6 flex gap-6 text-sm">
          <span className="text-slate-500">
            Receipts queued <span className="font-semibold text-slate-800">{batch.receiptsQueued}</span>
          </span>
          <span className="text-slate-500">
            Receipts sent <span className="font-semibold text-slate-800">{batch.receiptsSent}</span>
          </span>
          <span className="text-slate-500">
            Receipts failed <span className="font-semibold text-slate-800">{batch.receiptsFailed}</span>
          </span>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">Row</th>
              <th className="text-left px-6 py-3 font-medium">Donor</th>
              <th className="text-left px-6 py-3 font-medium">Status</th>
              <th className="text-left px-6 py-3 font-medium">Donor resolution</th>
              <th className="text-left px-6 py-3 font-medium">Notes</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const errors = Array.isArray(row.errorsJson) ? (row.errorsJson as string[]) : [];
              const warnings = Array.isArray(row.warningsJson) ? (row.warningsJson as string[]) : [];
              return (
                <tr key={row.id} className="hover:bg-slate-50 align-top">
                  <td className="px-6 py-3 text-slate-500">{row.rowNumber}</td>
                  <td className="px-6 py-3 text-slate-800">{rawFieldSummary(row.rawDataJson)}</td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROW_STATUS_STYLES[row.status] ?? "bg-slate-100 text-slate-600"}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-600">{row.donorResolution ? DONOR_RESOLUTION_LABELS[row.donorResolution] ?? row.donorResolution : "—"}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {errors.map((e, i) => (
                      <p key={i} className="text-red-600">
                        {e}
                      </p>
                    ))}
                    {warnings.map((w, i) => (
                      <p key={i} className="text-amber-600">
                        {w}
                      </p>
                    ))}
                    {errors.length === 0 && warnings.length === 0 && "—"}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {row.externalDonationId && (
                      <Link href={`/merchant/donations/external/${row.externalDonationId}`} className="text-blue-600 hover:underline font-medium">
                        View donation
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                  No row data recorded for this import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
