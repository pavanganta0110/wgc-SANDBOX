import NewTicketForm from "@/components/merchant/NewTicketForm";

export default function NewTicketPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-bold text-slate-900">New Support Ticket</h2>
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <NewTicketForm />
      </div>
    </div>
  );
}
