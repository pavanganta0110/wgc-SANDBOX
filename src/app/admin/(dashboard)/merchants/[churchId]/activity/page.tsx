import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";


export default async function MerchantActivityPage(props: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { churchId } = await props.params;

  // We fetch recent logs and filter by churchId to avoid Prisma JSON path errors
  // across different DB configurations in a sandbox environment.
  // We also check for onboardingApplicationId if the church is associated with one.
  const church = await prisma.church.findUnique({
    where: { id: churchId },
    select: { onboardingApplicationId: true }
  });

  const allLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1000
  });

  const activityLogs = allLogs.filter(log => {
    const meta = log.metadata as any;
    if (meta?.churchId === churchId) return true;
    if (church?.onboardingApplicationId && log.onboardingApplicationId === church.onboardingApplicationId) return true;
    return false;
  }).slice(0, 50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Activity Timeline</h2>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden p-6">
        {activityLogs.length === 0 ? (
          <p className="text-sm text-gray-500">No activity found for this merchant.</p>
        ) : (
          <div className="flow-root">
            <ul role="list" className="-mb-8">
              {activityLogs.map((log, logIdx) => (
                <li key={log.id}>
                  <div className="relative pb-8">
                    {logIdx !== activityLogs.length - 1 ? (
                      <span className="absolute left-4 top-4 -ml-px h-full w-0.5 bg-gray-200" aria-hidden="true" />
                    ) : null}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center ring-8 ring-white">
                          <svg className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
                          </svg>
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                          <p className="text-sm text-gray-500">
                            <span className="font-medium text-gray-900">{log.action}</span>
                            {' '}by <span className="font-medium text-gray-900">{log.actorEmail || 'System'}</span>
                          </p>
                          {log.metadata && Object.keys(log.metadata).length > 0 && (
                            <pre className="mt-2 text-xs text-gray-500 bg-gray-50 p-2 rounded overflow-x-auto max-w-2xl">
                              {JSON.stringify(log.metadata, null, 2)}
                            </pre>
                          )}
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-gray-500">
                          {new Date(log.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
