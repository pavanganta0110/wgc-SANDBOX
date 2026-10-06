import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getDonorPermissions } from "@/lib/donors/donorPermissions";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";
import AddUnsubscribeForm from "@/components/merchant/AddUnsubscribeForm";

export default async function UnsubscribedPage() {
  const session = await getSession();
  const permissions = getDonorPermissions(session?.role);
  if (!session?.churchId || !permissions.canView) redirect("/merchant/dashboard");

  const rows = await prisma.emailOptOut.findMany({ where: { churchId: session.churchId }, orderBy: { createdAt: "desc" }, take: 1000 });

  return (
    <div>
      <Link href="/merchant/giving-campaigns" className="text-sm text-blue-600 hover:underline flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> All Campaigns
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Unsubscribed emails</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            People who used the Unsubscribe link in one of your campaign emails. They&apos;re left out of every email campaign automatically — including monthly ones. Receipts and statements for gifts they make are not affected.
          </p>
        </div>
        {rows.length > 0 && (
          <a href="/api/merchant/giving-campaigns/unsubscribed?format=csv" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <Download className="w-4 h-4" aria-hidden="true" /> Download CSV
          </a>
        )}
      </div>

      {permissions.canSendStatements && <AddUnsubscribeForm />}

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
          <p className="text-sm text-slate-500">Nobody has unsubscribed yet.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-100">
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">Unsubscribed</th>
                <th className="px-6 py-3">How</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-6 py-3 text-slate-900">{r.normalizedEmail}</td>
                  <td className="px-6 py-3 text-slate-500">{formatDateTime(r.createdAt)}</td>
                  <td className="px-6 py-3 text-slate-500">{r.source === "UNSUBSCRIBE_LINK" ? "Unsubscribe link" : "Added by your team"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
