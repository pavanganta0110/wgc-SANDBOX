import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

export default async function MerchantDetailLayout(props: {
  children: ReactNode;
  params: Promise<{ churchId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { churchId } = await props.params;

  const church = await prisma.church.findUnique({
    where: { id: churchId },
  });

  if (!church) {
    notFound();
  }

  await createAuditLog({
    action: "ADMIN_MERCHANT_VIEWED",
    metadata: { churchId },
    actorEmail: session.email,
  });

  const tabs = [
    { name: "Overview", href: `/admin/merchants/${churchId}` },
    { name: "Users", href: `/admin/merchants/${churchId}/users` },
    { name: "Transactions", href: `/admin/merchants/${churchId}/transactions` },
    { name: "Donors", href: `/admin/merchants/${churchId}/donors` },
    { name: "Recurring", href: `/admin/merchants/${churchId}/recurring` },
    { name: "Giving Pages", href: `/admin/merchants/${churchId}/giving-pages` },
    { name: "Tickets", href: `/admin/merchants/${churchId}/tickets` },
    { name: "Activity", href: `/admin/merchants/${churchId}/activity` },
    { name: "Emails", href: `/admin/merchants/${churchId}/emails` },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-xl">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-sm font-semibold text-amber-700">
              WGC Support View — financial actions and payment routing changes are disabled.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{church.name}</h1>
      </div>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              href={tab.href}
              className="whitespace-nowrap border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              {tab.name}
            </Link>
          ))}
        </nav>
      </div>
      <div className="py-4">{props.children}</div>
    </div>
  );
}
