import { getAdminSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { formatCents } from "@/lib/format";
import { checkNonprofitVerificationStatus } from "@/lib/onboarding/nonprofitVerificationGuard";
import OpenMerchantDashboardButton from "@/components/admin/OpenMerchantDashboardButton";
import ResyncFinixTerminationButton from "@/components/admin/ResyncFinixTerminationButton";
import StateBadge from "@/components/merchant/StateBadge";

// Hoisted out of the component body so the impure Date.now() call isn't
// made directly during render (react-hooks/purity) — same value either way.
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

export default async function MerchantOverviewPage({ params }: { params: Promise<{ churchId: string }> | { churchId: string } }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  
  const { churchId } = await Promise.resolve(params);
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

  const irsDocument = church.onboardingApplicationId
    ? await prisma.onboardingInternalDocument.findFirst({
        where: { onboardingApplicationId: church.onboardingApplicationId, documentType: "IRS_501C3_DETERMINATION_LETTER", isCurrent: true },
        orderBy: { version: "desc" }
      })
    : null;

  const nonprofitVerification = await checkNonprofitVerificationStatus(churchId);

  // System Health integration (Phase 4) — real evidence only: a health
  // event this merchant's own operations actually produced (never inferred
  // from a global incident with zero merchant attribution — plenty of
  // severe incidents are platform-wide with no specific merchant at all).
  const recentMerchantHealthEvents = await prisma.systemHealthEvent.findMany({
    where: { merchantId: churchId, severity: { in: ["ERROR", "CRITICAL"] }, createdAt: { gte: daysAgo(7) } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { id: true, service: true, severity: true, message: true, createdAt: true, errorGroupId: true, wgcReference: true },
  });
  const merchantErrorGroupIds = Array.from(new Set(recentMerchantHealthEvents.map((e) => e.errorGroupId).filter((id): id is string => !!id)));
  const merchantErrorGroups = merchantErrorGroupIds.length
    ? await prisma.systemErrorGroup.findMany({
        where: { id: { in: merchantErrorGroupIds } },
        include: { incident: { select: { id: true, title: true, severity: true, status: true } } },
      })
    : [];

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
    (async () => {
      if (church.primaryOwnerUserId) {
        const owner = await prisma.user.findUnique({ where: { id: church.primaryOwnerUserId } });
        if (owner) return owner;
      }
      const adminUser = await prisma.user.findFirst({
        where: {
          churchId,
          role: { in: ["CHURCH_ADMIN", "church_admin", "ADMIN", "admin", "OWNER", "owner"] }
        },
        orderBy: { createdAt: "asc" }
      });
      if (adminUser) return adminUser;
      return prisma.user.findFirst({
        where: { churchId },
        orderBy: { createdAt: "asc" }
      });
    })()
  ]);

  const stats = [
    { name: "Total Users", stat: userCount },
    { name: "Successful Payments", stat: paymentCount },
    { name: "Total Donors", stat: donorCount },
    { name: "Active Recurring", stat: recurringCount },
    { name: "Support Tickets", stat: ticketCount },
  ];

  const legalName = onboardingApplication?.legalBusinessName || onboardingApplication?.organizationName || church.name;
  const einTaxId = church.taxId || (onboardingApplication?.businessTaxIdProvided ? "Provided (onboarding)" : "Not provided");

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold leading-6 text-gray-900">Merchant Overview</h2>
          <div className="mt-2 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${
              nonprofitVerification.isApproved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
            }`}>
              {nonprofitVerification.isApproved ? "501(c)(3) Verified" : "Verification Pending"}
            </span>
            <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold ${
              church.finixMerchantId ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"
            }`}>
              {church.finixMerchantId ? "Finix Activated" : "Pending Activation"}
            </span>
            {church.status === "TERMINATED" && (
              <span className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold bg-rose-100 text-rose-800">
                Account Terminated
              </span>
            )}
          </div>
          {church.status === "TERMINATED" && (
            <p className="mt-2 text-sm text-rose-700">
              Finix closed this merchant&rsquo;s account{church.terminatedAt ? ` on ${new Date(church.terminatedAt).toLocaleDateString()}` : ""}.
              {church.terminationReason ? ` Reason: ${church.terminationReason}` : ""}
            </p>
          )}
        </div>
        {session.role === "wgc_super_admin" && church.status === "ACTIVE" && (
          <OpenMerchantDashboardButton churchId={church.id} />
        )}
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
            <h3 className="text-base font-semibold leading-6 text-gray-900">Organization & Nonprofit Compliance Details</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">Legal business identity, EIN, 501(c)(3) IRS documentation, and Finix status.</p>
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
              <dt className="text-sm font-medium text-gray-900">Legal Business Name</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-medium">
                {legalName}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Employer Identification Number (EIN / Tax ID)</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono">
                {einTaxId}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">WGC Nonprofit Verification Status</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ${
                  nonprofitVerification.status === "VERIFIED_BY_WGC"
                    ? "bg-emerald-100 text-emerald-800"
                    : nonprofitVerification.status === "REJECTED"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-amber-100 text-amber-800"
                }`}>
                  {nonprofitVerification.status}
                </span>
                {nonprofitVerification.reason && (
                  <span className="text-xs text-gray-500">({nonprofitVerification.reason})</span>
                )}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">501(c)(3) IRS Determination Letter</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {irsDocument ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{irsDocument.originalFilename}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 font-mono">{irsDocument.status}</span>
                    </div>
                    {irsDocument.reviewedAt && (
                      <div className="text-xs text-slate-500">
                        Reviewed: {new Date(irsDocument.reviewedAt).toLocaleDateString()} {irsDocument.reviewedByUserId ? `by ${irsDocument.reviewedByUserId}` : ""}
                      </div>
                    )}
                    <Link
                      href={`/admin/documents`}
                      className="text-xs text-indigo-600 hover:underline font-medium mt-1 inline-block"
                    >
                      View in Document Management &rarr;
                    </Link>
                  </div>
                ) : (
                  <span className="text-gray-500 italic">No IRS 501(c)(3) document uploaded yet</span>
                )}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Finix Merchant ID</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0 font-mono flex items-center gap-3">
                {church.finixMerchantId || "Not assigned"}
                {church.finixMerchantId && (
                  <Link
                    href={`/admin/finix-webhook-events?merchantId=${encodeURIComponent(church.finixMerchantId)}`}
                    className="font-sans text-xs font-semibold text-blue-600 hover:underline"
                  >
                    View Webhook Events
                  </Link>
                )}
                {church.finixMerchantId && <ResyncFinixTerminationButton churchId={church.id} />}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Primary Owner</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {primaryOwner ? (
                  <div className="flex flex-col">
                    <span>{primaryOwner.name || primaryOwner.email}</span>
                    <span className="text-gray-500">{primaryOwner.email}</span>
                  </div>
                ) : (
                  <span className="text-gray-500 italic">No owner found</span>
                )}
              </dd>
            </div>
            <div className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
              <dt className="text-sm font-medium text-gray-900">Onboarding & Finix Status</dt>
              <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                {church.finixMerchantId
                  ? "APPROVED"
                  : onboardingApplication
                  ? (onboardingApplication.status === "COMPLETED" ? "APPROVED" : onboardingApplication.status)
                  : "No Application"}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="overflow-hidden bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:px-6 flex justify-between items-center">
          <div>
            <h3 className="text-base font-semibold leading-6 text-gray-900">System Health</h3>
            <p className="mt-1 max-w-2xl text-sm text-gray-500">
              Errors and incidents this merchant&rsquo;s own activity actually produced in the last 7 days — never inferred from a global incident
              with no specific merchant evidence.
            </p>
          </div>
          <Link href="/admin/system-health/errors" className="text-xs font-semibold text-indigo-600 hover:underline">
            View Platform-Wide Errors &rarr;
          </Link>
        </div>
        <div className="border-t border-gray-100">
          {merchantErrorGroups.length === 0 ? (
            <p className="px-4 py-6 sm:px-6 text-sm text-gray-500 italic">No system health issues recorded for this merchant recently.</p>
          ) : (
            <dl className="sm:divide-y sm:divide-gray-100">
              {merchantErrorGroups.map((g) => (
                <div key={g.id} className="py-4 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <StateBadge state={g.severity} />
                    {g.service}
                  </dt>
                  <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">
                    <Link href={`/admin/system-health/errors/${g.id}`} className="hover:underline font-medium text-gray-800">
                      {g.message}
                    </Link>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <StateBadge state={g.status} />
                      {g.incident && (
                        <>
                          <span>&middot;</span>
                          <Link href={`/admin/system-health/incidents/${g.incident.id}`} className="text-indigo-600 hover:underline">
                            Part of incident: {g.incident.title}
                          </Link>
                        </>
                      )}
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>
    </div>
  );
}
