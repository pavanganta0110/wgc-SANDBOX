import Link from "next/link";
import { LifeBuoy, BookOpen, Activity, Plus } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import StateBadge from "@/components/merchant/StateBadge";

export default async function SupportHomePage() {
  const session = await getSession();
  const recentTickets = session?.churchId
    ? await prisma.supportTicket.findMany({
        where: { churchId: session.churchId },
        orderBy: { updatedAt: "desc" },
        take: 5,
      })
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Support</h2>
        <Link href="/merchant/support/tickets/new" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Ticket
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/merchant/support/tickets" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-slate-200">
          <LifeBuoy className="w-5 h-5 text-blue-600 mb-2" />
          <div className="text-sm font-bold text-slate-900">My Tickets</div>
          <div className="text-xs text-slate-500 mt-1">View and manage your support requests</div>
        </Link>
        <Link href="/merchant/support/help" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-slate-200">
          <BookOpen className="w-5 h-5 text-amber-600 mb-2" />
          <div className="text-sm font-bold text-slate-900">Help Center</div>
          <div className="text-xs text-slate-500 mt-1">Answers to common questions</div>
        </Link>
        <Link href="/merchant/support/status" className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 hover:border-slate-200">
          <Activity className="w-5 h-5 text-green-600 mb-2" />
          <div className="text-sm font-bold text-slate-900">System Status</div>
          <div className="text-xs text-slate-500 mt-1">Current status of WGC Payments services</div>
        </Link>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-slate-900">Recent Tickets</h3>
          <Link href="/merchant/support/tickets" className="text-xs font-semibold text-blue-600 hover:underline">View all</Link>
        </div>
        {recentTickets.length === 0 ? (
          <p className="text-sm text-slate-500 py-4 text-center">No support tickets yet.</p>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentTickets.map((ticket) => (
              <Link key={ticket.id} href={`/merchant/support/tickets/${ticket.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{ticket.subject}</div>
                  <div className="text-xs text-slate-500">{new Date(ticket.updatedAt).toLocaleDateString()}</div>
                </div>
                <StateBadge state={ticket.status} />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
            <LifeBuoy className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Contact WGC Payments Support</h3>
            <p className="text-xs text-slate-500">We typically respond within one business day.</p>
          </div>
        </div>
        <a
          href="mailto:support@wgcpayments.com"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700"
        >
          support@wgcpayments.com
        </a>
      </div>
    </div>
  );
}
