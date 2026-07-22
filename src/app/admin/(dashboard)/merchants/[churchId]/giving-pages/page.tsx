import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function MerchantGivingPagesPage(props: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { churchId } = await props.params;

  const givingPages = await prisma.givingLink.findMany({
    where: { churchId },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Giving Pages</h2>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Title</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">URL</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Owner</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Powered by WGC</th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Donations</th>
              <th scope="col" className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">Collected</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {givingPages.map((page) => {
              const branding = page.brandingSettingsJson as any;
              const poweredBy = branding?.hidePoweredByWgc ? "Hidden" : "Visible";
              
              return (
                <tr key={page.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {page.publicTitle || page.internalName}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <Link href={`/g/${page.publicSlug}`} target="_blank" className="text-indigo-600 hover:text-indigo-900">
                      /g/{page.publicSlug}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {page.ownerUserId || "Organization"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                      page.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                    }`}>
                      {page.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    {poweredBy}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">
                    {page.successfulDonations}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 text-right">
                    ${(page.totalCollectedCents / 100).toFixed(2)}
                  </td>
                </tr>
              );
            })}
            
            {givingPages.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                  No giving pages found for this merchant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
