import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { loadEmailLogsList } from "@/lib/emailLogs/loadEmailLogsList";
import EmailComposer from "./EmailComposer";

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

export default async function MerchantEmailsPage({
  params,
}: {
  params: Promise<{ churchId: string }> | { churchId: string };
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const resolvedParams = await params;
  const churchId = resolvedParams.churchId;

  const users = await prisma.user.findMany({
    where: { churchId },
    select: { id: true, email: true, name: true },
  });

  const userEmails = users.map((u) => u.email);

  const emailLogs = await prisma.emailLog.findMany({
    where: { to: { in: userEmails } },
    orderBy: { createdAt: "desc" },
  });

  // Donor-facing emails this organization sent (receipts, statements,
  // invoices, etc.) — a different category from the staff/account emails
  // above (which go to this org's own dashboard users). Same churchId-
  // scoped loader the merchant-facing Email Logs page uses, reused as-is
  // since it takes no session/auth dependency.
  const { logs: donorEmailLogs, total: donorEmailTotal, summary: donorEmailSummary } = await loadEmailLogsList(churchId, {}, 1);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          Communication & Emails
        </h2>
        <p className="text-sm text-gray-500">
          Manage communications with users of this organization.
        </p>
      </div>

      <EmailComposer users={users} churchId={churchId} />

      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Email Logs</h3>
        {emailLogs.length === 0 ? (
          <p className="text-sm text-gray-500">
            No emails have been sent to this organization's users yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    To
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {emailLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.to}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                      {log.subject}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.status === "SENT"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-medium text-gray-900">Donor Email Logs</h3>
          <div className="text-xs text-gray-500 space-x-4">
            <span>{donorEmailSummary.totalSent} sent</span>
            <span>{donorEmailSummary.uniqueDonorsReached} unique donors reached</span>
          </div>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Emails this organization has sent to its own donors — receipts, statements, invoices, and more. Same log a merchant sees on their own Email Logs page.
        </p>
        {donorEmailLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No donor-facing emails logged for this organization yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead>
                <tr>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recipient</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {donorEmailLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {log.recipientName || log.recipientEmail}
                      <span className="block text-xs text-gray-400">{log.recipientEmail}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">{log.subject}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {CATEGORY_LABELS[log.category] || log.category}
                      {log.resendCount > 0 && <span className="ml-1 text-xs text-gray-400">(Resent)</span>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          log.status === "SENT"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {log.status}
                      </span>
                      {log.status === "FAILED" && log.failureReason && (
                        <span className="block text-xs text-red-500 mt-0.5 max-w-[200px] truncate">{log.failureReason}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {donorEmailTotal > donorEmailLogs.length && (
              <p className="text-xs text-gray-400 mt-3">Showing the {donorEmailLogs.length} most recent of {donorEmailTotal} total.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
