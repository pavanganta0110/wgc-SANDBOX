import { getAdminSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function MerchantTicketsPage(props: { params: Promise<{ churchId: string }> }) {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const { churchId } = await props.params;

  const tickets = await prisma.supportTicket.findMany({
    where: { churchId },
    orderBy: { createdAt: 'desc' }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Support Tickets</h2>
      </div>

      <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
        <table className="min-w-full divide-y divide-gray-300">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Ticket Number</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Subject</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Category</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Priority</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Status</th>
              <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Created At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {tickets.map((ticket: any) => (
              <tr key={ticket.id}>
                <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                  {ticket.ticketNumber}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {ticket.subject}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {ticket.category}
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    ticket.priority === 'URGENT' || ticket.priority === 'HIGH' ? 'bg-red-50 text-red-700 ring-red-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                  }`}>
                    {ticket.priority}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset ${
                    ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS' ? 'bg-green-50 text-green-700 ring-green-600/20' : 'bg-gray-50 text-gray-600 ring-gray-500/10'
                  }`}>
                    {ticket.status}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                  {new Date(ticket.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
            
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm text-gray-500">
                  No support tickets found for this merchant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
