import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formatCurrency(cents: number | null | undefined, currency: string = "USD") {
  if (cents == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function MerchantRecurringPage({ params }: { params: { churchId: string } }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = params;

  const subscriptions = await prisma.finixSubscription.findMany({
    where: { churchId },
    orderBy: { createdAtFinix: 'desc' },
    take: 100,
  });

  const donorIds = subscriptions.map(s => s.donorId).filter(Boolean) as string[];
  const donors = await prisma.donor.findMany({
    where: { id: { in: donorIds } },
  });

  const donorMap = new Map(donors.map(d => [d.id, d]));

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Recurring Subscriptions</h2>
          <p className="mt-2 text-sm text-gray-500">Merchant recurring donations will appear here.</p>
        </div>
      </div>
      
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Donor</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Amount</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Interval</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Next Billing</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Fund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {subscriptions.map((s: any) => {
                  const d = s.donorId ? donorMap.get(s.donorId) : null;
                  
                  return (
                    <tr key={s.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900 sm:pl-0">
                        {d ? <>{d.name}<br /><span className="text-xs text-gray-400">{d.email}</span></> : 'Anonymous'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {formatCurrency(s.amountCents, s.currency || "USD")}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {s.billingInterval || '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                          s.state === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-green-600/20' : 
                          s.state === 'CANCELED' ? 'bg-gray-50 text-gray-600 ring-gray-500/10' : 
                          'bg-yellow-50 text-yellow-800 ring-yellow-600/20'
                        }`}>
                          {s.state || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {s.nextBillingDate ? new Date(s.nextBillingDate).toLocaleDateString() : '-'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {s.fundName || '-'}
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
