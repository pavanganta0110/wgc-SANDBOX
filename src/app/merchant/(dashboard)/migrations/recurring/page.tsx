import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { listScheduleSubmissions } from "@/lib/migrations/recurringSubmission";
import RecurringScheduleUpload from "@/components/merchant/RecurringScheduleUpload";

export const dynamic = "force-dynamic";

/** Moving recurring donors from another platform: the merchant sends WGC their schedule file here. */
export default async function MerchantRecurringSchedulePage() {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canManageMigrations")) redirect("/merchant/dashboard");

  const submissions = await listScheduleSubmissions(auth.churchId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/merchant/migrations" className="text-sm text-indigo-600 hover:underline">
          &larr; Migration Center
        </Link>
        <h2 className="mt-2 text-lg font-medium">Move your recurring donors from Continue to Give</h2>
        <p className="mt-1 text-sm text-gray-500">
          WGC moves your recurring gifts so donors keep giving on the same schedule. Your saved cards and bank accounts are moved separately, straight from Continue to Give to our processor, Finix. They never pass through this page or WGC.
        </p>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
        <li>Ask Continue to Give for an export of your recurring gifts, and for the saved cards to be sent to Finix.</li>
        <li>Send us the recurring schedule below, with no card or bank numbers.</li>
        <li>WGC checks it with you, then creates each gift with its first charge on the date in the file.</li>
        <li>Stop your Continue to Give schedules just before that date, so no donor is charged twice.</li>
      </ol>

      <RecurringScheduleUpload />

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3 text-sm font-bold text-slate-900">Files you have sent</div>
        {submissions.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-left text-sm">
            <thead className="text-xs text-slate-500">
              <tr>
                <th className="px-5 py-2 font-semibold">Sent</th>
                <th className="px-5 py-2 font-semibold">File</th>
                <th className="px-5 py-2 font-semibold">Gifts</th>
                <th className="px-5 py-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td className="px-5 py-3 text-slate-600">{new Date(s.createdAt).toLocaleDateString()}</td>
                  <td className="px-5 py-3">{s.fileName || "—"}</td>
                  <td className="px-5 py-3 tabular-nums">{s.rowCount}</td>
                  <td className="px-5 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${s.usedByJobId ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"}`}>
                      {s.usedByJobId ? "Picked up by WGC" : "Sent, waiting for WGC"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
