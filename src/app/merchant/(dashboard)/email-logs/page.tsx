import Link from "next/link";
import { redirect } from "next/navigation";
import { formatCents } from "@/lib/format";
import { requireMerchantSession } from "@/lib/auth/requireMerchantSession";
import { hasPermission } from "@/lib/auth/permissions";
import { isAuthError } from "@/lib/auth/errors";
import { formatDateCDT } from "@/lib/formatDateTimeCDT";
import { loadEmailLogsList } from "@/lib/emailLogs/loadEmailLogsList";
import StateBadge from "@/components/merchant/StateBadge";
import Pagination from "@/components/merchant/Pagination";
import EmailLogResendButton from "@/components/merchant/EmailLogResendButton";

const CATEGORY_LABELS: Record<string, string> = {
  DONATION_RECEIPT: "Donation Receipt",
  EXTERNAL_DONATION_RECEIPT: "External Donation Receipt",
  RECURRING_CONFIRMATION: "Recurring Confirmation",
  ANNUAL_STATEMENT: "Annual Statement",
  INVOICE: "Invoice",
  MERCHANDISE_ORDER: "Merchandise Order",
  SUBSCRIPTION_SETUP_LINK: "Subscription Setup Link",
  OTHER: "Other",
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; status?: string; search?: string; from?: string; to?: string }>;
}) {
  let auth;
  try {
    auth = await requireMerchantSession();
  } catch (err) {
    if (isAuthError(err)) redirect("/merchant/login");
    throw err;
  }
  if (!hasPermission(auth, "canViewEmailLogs")) redirect("/merchant/dashboard");
  const canResend = hasPermission(auth, "canResendEmails");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page || "1", 10) || 1);
  const { logs, total, pageCount, pageSize, summary } = await loadEmailLogsList(
    auth.churchId,
    { category: sp.category, status: sp.status, search: sp.search, from: sp.from, to: sp.to },
    page
  );

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between mb-6">
        <div>
          <h2 className="text-lg font-medium">Email Logs</h2>
          <p className="mt-1 text-sm text-gray-500">Every email sent to your donors and contacts — receipts, statements, invoices, and more.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Emails Sent" value={String(summary.totalSent)} />
        <SummaryCard label="Unique Donors Reached" value={String(summary.uniqueDonorsReached)} />
      </div>

      <form className="flex flex-wrap gap-3 mb-4" method="GET">
        <input
          type="text"
          name="search"
          defaultValue={sp.search || ""}
          placeholder="Search recipient name or email"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-64"
        />
        <select name="category" defaultValue={sp.category || ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All Types</option>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select name="status" defaultValue={sp.status || ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All Statuses</option>
          <option value="SENT">Sent</option>
          <option value="FAILED">Failed</option>
        </select>
        <input type="date" name="from" defaultValue={sp.from || ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <input type="date" name="to" defaultValue={sp.to || ""} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="submit" className="rounded-lg bg-slate-900 text-white px-4 py-2 text-sm font-semibold">Filter</button>
        {(sp.search || sp.category || sp.status || sp.from || sp.to) && (
          <Link href="/merchant/email-logs" className="text-sm text-indigo-600 hover:underline self-center">Clear</Link>
        )}
      </form>

      {logs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">
          No emails logged yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Recipient</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Subject</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Sent</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
                {canResend && <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">&nbsp;</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-sm">
                    {log.donorId ? (
                      <Link href={`/merchant/donors/${log.donorId}`} className="text-indigo-600 hover:underline">{log.recipientName || log.recipientEmail}</Link>
                    ) : (
                      <span className="text-slate-700">{log.recipientName || log.recipientEmail}</span>
                    )}
                    <p className="text-xs text-slate-400">{log.recipientEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">
                    {CATEGORY_LABELS[log.category] || log.category}
                    {log.resendCount > 0 && <span className="ml-1.5 text-xs text-slate-400">(Resent)</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 max-w-xs truncate">{log.subject}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDateCDT(log.createdAt)}</td>
                  <td className="px-4 py-3 text-sm">
                    <StateBadge state={log.status} />
                    {log.status === "FAILED" && log.failureReason && (
                      <p className="text-xs text-red-500 mt-0.5 max-w-[180px] truncate">{log.failureReason}</p>
                    )}
                  </td>
                  {canResend && (
                    <td className="px-4 py-3 text-sm">
                      {log.relatedEntityType && log.category !== "RECURRING_CONFIRMATION" ? (
                        <EmailLogResendButton emailLogId={log.id} />
                      ) : null}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={pageSize} />
        </div>
      )}
    </div>
  );
}
