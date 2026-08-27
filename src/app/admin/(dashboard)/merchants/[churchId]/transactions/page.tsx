import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EXCLUDE_NON_DONATION_TRANSFERS } from "@/lib/auth/scopes";
import { formatPersonName } from "@/lib/formatPersonName";

function formatCurrency(cents: number | null | undefined, currency: string = "USD") {
  if (cents == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function MerchantTransactionsPage({
  params,
  searchParams
}: {
  params: Promise<{ churchId: string }> | { churchId: string };
  searchParams: Promise<{ search?: string }> | { search?: string };
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  const search = resolvedSearchParams?.search || "";

  // Query FinixTransfers — excludes Finix's own merchant funding/
  // settlement transfers (subtype starting SETTLEMENT_), which are
  // payouts to the org's bank account, not donor transactions, and have
  // no corresponding Payment row. Same exclusion as the merchant-facing
  // Payments pages (buildFinixTransferScope).
  let transfers = await prisma.finixTransfer.findMany({
    where: { churchId, ...EXCLUDE_NON_DONATION_TRANSFERS },
    orderBy: { createdAtFinix: "desc" },
    take: 100,
  });

  // FinixTransfer.paymentId is never written anywhere in the codebase — the
  // real donor/payment-method join goes through the payment INSTRUMENT
  // (finixPaymentInstrumentId), same as the merchant-facing Payments page
  // (src/app/merchant/(dashboard)/transactions/payments/page.tsx). Joining
  // via the dead paymentId column meant every row here showed "Anonymous"
  // regardless of whether the donor actually gave their name.
  const transferIds = transfers.map(t => t.finixTransferId);
  const instrumentIds = transfers.map(t => t.finixPaymentInstrumentId).filter(Boolean) as string[];

  const instruments = instrumentIds.length
    ? await prisma.finixPaymentInstrumentSnapshot.findMany({
        where: { finixPaymentInstrumentId: { in: instrumentIds } },
      })
    : [];
  const instrumentMap = new Map(instruments.map(i => [i.finixPaymentInstrumentId, i]));

  const donorIds = instruments.map(i => i.donorId).filter(Boolean) as string[];
  const donors = donorIds.length
    ? await prisma.donor.findMany({ where: { id: { in: donorIds } } })
    : [];
  const donorMap = new Map(donors.map(d => [d.id, d]));

  const payments = transferIds.length
    ? await prisma.payment.findMany({
        where: { churchId, finixTransferId: { in: transferIds } },
      })
    : [];
  const paymentByTransfer = new Map(payments.filter(p => p.finixTransferId).map(p => [p.finixTransferId as string, p]));

  const refunds = await prisma.finixRefundOrReversal.findMany({
    where: { finixOriginalTransferId: { in: transferIds } },
  });

  const disputes = await prisma.finixDispute.findMany({
    where: { finixTransferId: { in: transferIds } },
  });

  const refundMap = new Map(refunds.map(r => [r.finixOriginalTransferId, r]));
  const disputeMap = new Map(disputes.map(d => [d.finixTransferId, d]));

  // Filtering if there's a search term
  if (search) {
    const s = search.toLowerCase();
    transfers = transfers.filter((t: any) => {
      const instrument = t.finixPaymentInstrumentId ? instrumentMap.get(t.finixPaymentInstrumentId) : null;
      const d = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
      const matchesTransferId = t.finixTransferId.toLowerCase().includes(s);
      const matchesDonorName = d?.name?.toLowerCase().includes(s);
      const matchesDonorEmail = d?.email?.toLowerCase().includes(s);
      return matchesTransferId || matchesDonorName || matchesDonorEmail;
    });
  }

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Transactions</h2>
          <p className="mt-2 text-sm text-gray-500">Recent transfers and associated payments.</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <form className="flex rounded-md shadow-sm">
            <input
              type="text"
              name="search"
              defaultValue={search}
              placeholder="Search donor or ID..."
              className="block w-full min-w-0 flex-1 rounded-none rounded-l-md border-0 py-1.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            />
            <button
              type="submit"
              className="relative -ml-px inline-flex items-center gap-x-1.5 rounded-r-md px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              Search
            </button>
          </form>
        </div>
      </div>
      
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Date</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Donor</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Method</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Fund</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Attributed User</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Refund/Dispute</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transfers.map((t: any) => {
                  const instrument = t.finixPaymentInstrumentId ? instrumentMap.get(t.finixPaymentInstrumentId) : null;
                  const d = instrument?.donorId ? donorMap.get(instrument.donorId) : null;
                  const p = paymentByTransfer.get(t.finixTransferId);
                  const refund = refundMap.get(t.finixTransferId);
                  const dispute = disputeMap.get(t.finixTransferId);
                  const donorDisplayName = formatPersonName(d?.name, instrument?.accountHolderName);
                  // instrument.paymentMethodType is Finix's actual card-vs-bank
                  // classification. t.subtype describes how the transfer was
                  // CREATED (e.g. "API" for any direct API call, including every
                  // donation through this platform's own donate endpoint) — never
                  // meaningful as a donor-facing "payment method" and was being
                  // shown here in place of the real classification.
                  const methodLabel = instrument?.cardBrand || (instrument?.bankLast4 ? "Bank Account (ACH)" : instrument?.paymentMethodType || "-");

                  return (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900 sm:pl-0">
                        {t.createdAtFinix ? new Date(t.createdAtFinix).toLocaleDateString() : 'N/A'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {donorDisplayName}<br /><span className="text-xs text-gray-400">{d?.email || "-"}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {formatCurrency(t.amountCents, t.currency || "USD")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {methodLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          t.state === 'SUCCEEDED' ? 'bg-green-50 text-green-700 ring-green-600/20' :
                          t.state === 'FAILED' ? 'bg-red-50 text-red-700 ring-red-600/10' :
                          'bg-gray-50 text-gray-600 ring-gray-500/10'
                        }`}>
                          {t.state || p?.status || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {p?.fundName || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {p?.attributedUserId || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {refund && <span className="text-orange-600 block">Refunded: {refund.state}</span>}
                        {dispute && <span className="text-red-600 block">Dispute: {dispute.state}</span>}
                        {!refund && !dispute && '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
