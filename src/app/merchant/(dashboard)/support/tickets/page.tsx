import Link from "next/link";
import { Plus } from "lucide-react";
import TicketListPanel from "@/components/merchant/TicketListPanel";

export default function TicketsListPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">My Tickets</h2>
        <Link href="/merchant/support/tickets/new" className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold">
          <Plus className="w-4 h-4" /> New Ticket
        </Link>
      </div>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <TicketListPanel />
      </div>
    </div>
  );
}
