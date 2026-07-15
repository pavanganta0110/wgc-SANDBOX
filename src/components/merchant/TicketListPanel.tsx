"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import StateBadge from "@/components/merchant/StateBadge";
import { categoryLabel } from "@/lib/support/ticketCategories";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  updatedAt: string;
}

const TABS = [
  { key: "OPEN", label: "Open" },
  { key: "CLOSED", label: "Closed" },
  { key: "ALL", label: "All" },
];

export default function TicketListPanel() {
  const [tab, setTab] = useState("OPEN");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const pageSize = 20;

  const load = useCallback(async (t: string, p: number) => {
    setLoading(true);
    setError(false);
    try {
      const statusParam = t === "ALL" ? "" : `&status=${t}`;
      const res = await fetch(`/api/merchant/support/tickets?page=${p}${statusParam}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTickets(data.tickets);
      setTotal(data.total);
      setPage(p);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(tab, 1);
  }, [tab, load]);

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-slate-100">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px ${
              tab === t.key ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="text-sm text-red-600 flex items-center gap-2">
          Failed to load tickets.
          <button onClick={() => load(tab, page)} className="font-semibold text-blue-600 hover:underline">Retry</button>
        </div>
      ) : tickets.length === 0 ? (
        <p className="text-sm text-slate-500 py-6 text-center">No tickets in this view.</p>
      ) : (
        <>
          <div className="divide-y divide-slate-50">
            {tickets.map((ticket) => (
              <Link key={ticket.id} href={`/merchant/support/tickets/${ticket.id}`} className="flex items-center justify-between py-3 hover:bg-slate-50 -mx-2 px-2 rounded-lg">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{ticket.subject}</div>
                  <div className="text-xs text-slate-500">
                    {categoryLabel(ticket.category)} · {new Date(ticket.updatedAt).toLocaleDateString()}
                  </div>
                </div>
                <StateBadge state={ticket.status} />
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
            <span>Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span>
            <div className="flex gap-2">
              <button onClick={() => load(tab, page - 1)} disabled={page <= 1} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Previous</button>
              <button onClick={() => load(tab, page + 1)} disabled={page * pageSize >= total} className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-40">Next</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
