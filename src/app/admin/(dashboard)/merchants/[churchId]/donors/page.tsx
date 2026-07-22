import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

function formatCurrency(cents: number | null | undefined, currency: string = "USD") {
  if (cents == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default async function MerchantDonorsPage({ params }: { params: { churchId: string } }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { churchId } = params;

  const donorStats = await prisma.$queryRaw<
    Array<{
      id: string;
      name: string | null;
      email: string | null;
      createdAt: Date;
      donationCount: bigint;
      totalAmountCents: bigint;
    }>
  >`
    SELECT
      d.id,
      d.name,
      d.email,
      d."createdAt",
      COUNT(p.id) as "donationCount",
      COALESCE(SUM(p."amountCents"), 0) as "totalAmountCents"
    FROM "Donor" d
    LEFT JOIN "Payment" p ON p."donorId" = d.id AND p.status = 'SUCCEEDED'
    WHERE d."churchId" = ${churchId}
    GROUP BY d.id
    ORDER BY "totalAmountCents" DESC, d."createdAt" DESC
    LIMIT 100
  `;

  return (
    <div>
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-medium">Donors</h2>
          <p className="mt-2 text-sm text-gray-500">Merchant donors and giving summaries.</p>
        </div>
      </div>
      
      <div className="mt-8 flow-root">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-300">
              <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-0">Name</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Email</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Donations</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Total Amount</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Created At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {donorStats.map((d: any) => (
                  <tr key={d.id}>
                    <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-gray-900 sm:pl-0">
                      {d.name || 'Anonymous'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {d.email || '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {Number(d.donationCount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {formatCurrency(Number(d.totalAmountCents))}
                    </td>
                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
