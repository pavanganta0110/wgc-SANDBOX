"use client";

import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { formatCents } from "@/lib/format";
import { inputClass, readApiError, secondaryButton } from "@/components/events/merchant/api";

interface Row {
  id: string;
  confirmationCode: string;
  registrantName: string;
  registrantEmail: string;
  groupName: string | null;
  attendeeCount: number;
  totalCents: number;
  paymentStatus: string;
  internalNote: string | null;
  createdAt: string;
}

const PAYMENT_STYLES: Record<string, string> = {
  SUCCEEDED: "bg-green-50 text-green-700",
  PENDING: "bg-amber-50 text-amber-700",
  FREE: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-50 text-red-700",
  UNPAID: "bg-red-50 text-red-700",
};

export default function RegistrationsTab({ eventId, canExport }: { eventId: string; canExport: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("CONFIRMED");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/merchant/events/${eventId}/registrations?q=${encodeURIComponent(q)}&status=${status}`, { cache: "no-store" });
    if (!res.ok) return setError(await readApiError(res));
    setError(null);
    setRows((await res.json()).registrations);
  }, [eventId, q, status]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-3 w-full sm:w-auto">
          <div className="w-full sm:w-72">
            <label htmlFor="reg-search" className="sr-only">Search registrations</label>
            <input id="reg-search" className={inputClass} placeholder="Search name, email, code or group" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div>
            <label htmlFor="reg-status" className="sr-only">Registration status</label>
            <select id="reg-status" className={inputClass} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PAYMENT_FAILED">Payment failed</option>
              <option value="CANCELED">Canceled</option>
            </select>
          </div>
        </div>
        {canExport && (
          <a href={`/api/merchant/events/${eventId}/export`} className={secondaryButton}>
            <Download className="w-4 h-4 mr-1.5" aria-hidden="true" /> Export CSV
          </a>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">{status === "PAYMENT_FAILED" ? "No registrations with a failed payment." : status === "CANCELED" ? "No canceled registrations." : "No registrations yet."}</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                {["Code", "Registrant", "Group", "Attendees", "Total", "Payment", "Registered"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 text-sm font-mono">{r.confirmationCode}</td>
                  <td className="px-4 py-3 text-sm">
                    <p className="font-medium text-slate-900">{r.registrantName}</p>
                    <p className="text-xs text-slate-500">{r.registrantEmail}</p>
                    {r.internalNote && status === "PAYMENT_FAILED" && <p className="text-xs text-red-600 mt-0.5">{r.internalNote}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.groupName ?? "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.attendeeCount}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{r.totalCents > 0 ? formatCents(r.totalCents) : "Free"}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${PAYMENT_STYLES[r.paymentStatus.toUpperCase()] ?? "bg-slate-100 text-slate-700"}`}>{r.paymentStatus}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">{new Date(r.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
