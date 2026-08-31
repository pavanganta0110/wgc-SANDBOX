import Link from "next/link";
import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { formatCents, formatSignedCents } from "@/lib/format";
import { loadSettlementsList } from "@/lib/finix/settlementsList";
import StateBadge from "@/components/merchant/StateBadge";
import CopyableIdBadge from "@/components/merchant/CopyableIdBadge";
import { resolveSettlementDisplayStatus, getSettlementStatusLabel } from "@/lib/finix/settlementStatus";
import { formatDateTimeCDT as formatDateTime } from "@/lib/formatDateTimeCDT";

const PAGE_SIZE = 25;

// Admin mirror of the merchant's own Settlements list
// (src/app/merchant/(dashboard)/settlements/page.tsx) — same underlying
// loadSettlementsList query, no filter bar / column picker, since this is
// a read-only support view rather than the organization's own working
// dashboard.
export default async function AdminSettlementsPage({
  params,
  searchParams,
}: {
  params: Promise<{ churchId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam || "1", 10) || 1);

  const { rows, totalCount } = await loadSettlementsList(
    churchId,
    {},
    { key: "createdAtFinix", dir: "desc" },
    page,
    PAGE_SIZE,
  );
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div>
      <div>
        <h2 className="text-lg font-medium">Settlements</h2>
        <p className="mt-2 text-sm text-gray-500">Settlement batches this organization has been funded for.</p>
      </div>

      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">No settlements for this organization yet.</p>
            ) : (
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">ID</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Created</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Gross</th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Fees</th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Net</th>
                    <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Transactions</th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Deposit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map(({ settlement, deposit }) => {
                    const displayStatus = resolveSettlementDisplayStatus(settlement);
                    return (
                      <tr key={settlement.id}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-0">
                          <Link
                            href={`/admin/merchants/${churchId}/settlements/${settlement.finixSettlementId}`}
                            className="text-blue-600 hover:underline"
                          >
                            <CopyableIdBadge id={settlement.finixSettlementId} />
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {formatDateTime(settlement.createdAtFinix)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm">
                          <StateBadge state={displayStatus} label={getSettlementStatusLabel(displayStatus)} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-900 font-semibold">
                          {formatCents(settlement.totalAmountCents ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                          {formatSignedCents(-(settlement.feeAmountCents ?? 0))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-900 font-semibold">
                          {formatCents(settlement.netAmountCents ?? 0)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                          {settlement.transactionCount ?? 0}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {deposit ? <StateBadge state={deposit.state} /> : <span className="text-gray-400">Not Yet Linked</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
                <span>
                  Page {page} of {pageCount} ({totalCount} total)
                </span>
                <div className="flex gap-3">
                  {page > 1 && (
                    <Link href={`?page=${page - 1}`} className="text-blue-600 hover:underline">
                      Previous
                    </Link>
                  )}
                  {page < pageCount && (
                    <Link href={`?page=${page + 1}`} className="text-blue-600 hover:underline">
                      Next
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
