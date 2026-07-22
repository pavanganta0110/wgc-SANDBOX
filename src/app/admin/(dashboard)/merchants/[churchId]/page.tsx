import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents } from "@/lib/format";

export default async function MerchantOverviewPage({ params }: { params: { churchId: string } }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  
  // Await params per Next.js 15+ best practices if applicable, or just use it.
  const churchId = params.churchId;
  const church = await prisma.church.findUnique({
    where: { id: churchId },
  });

  if (!church) {
    return (
      <div className="p-6">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6 text-center">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Merchant Not Found</h3>
          </div>
        </div>
      </div>
    );
  }

  const onboardingApplication = church.onboardingApplicationId 
    ? await prisma.onboardingApplication.findUnique({ where: { id: church.onboardingApplicationId } })
    : null;

  const [
    userCount,
    paymentCount,
    donorCount,
    recurringCount,
    ticketCount,
    primaryOwner
  ] = await Promise.all([
    prisma.user.count({ where: { churchId } }),
    prisma.payment.count({ where: { churchId, status: "SUCCEEDED" } }),
    prisma.donor.count({ where: { churchId } }),
    prisma.finixSubscription.count({ where: { churchId, state: "ACTIVE" } }),
    prisma.supportTicket.count({ where: { churchId } }),
    prisma.user.findFirst({
      where: { churchId, role: "OWNER" },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const stats = [
    { name: "Total Users", stat: userCount },
    { name: "Successful Payments", stat: paymentCount },
    { name: "Total Donors", stat: donorCount },
    { name: "Active Recurring", stat: recurringCount },
    { name: "Support Tickets", stat: ticketCount },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold leading-6 text-gray-900">Merchant Overview</h2>
        <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-sm font-medium ${
          church.finixMerchantId ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
        }`}>
          {church.finixMerchantId ? "Activated" : "Pending Activation"}
        </span>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((item) => (
          <div
            key={item.name}
            className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6"
          >
            <dt className="truncate text-sm font-medium text-gray-500">{item.name}</dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              {item.stat}
            </dd>
          </div>
        ))}
      </dl>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900">Organization Details</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Details and contact information.</p>
          </div>
        </div>
        <div className="border-t border-gray-100 px-4 py-5 sm:p-0">
          <dl className="sm:divide-y sm:divide-gray-100">
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Organization Name</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {church.name}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Finix Merchant ID</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono">
                {church.finixMerchantId || "Not assigned"}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Primary Owner</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {primaryOwner ? (
                  <div className="flex flex-col">
                    <span>{primaryOwner.name}</span>
                    <span className="text-gray-500">{primaryOwner.email}</span>
                  </div>
                ) : (
                  <span className="text-gray-500 italic">No owner found</span>
                )}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Onboarding Status</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {onboardingApplication ? onboardingApplication.status : "No Application"}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
