"use client";

import { useEffect, useState, useCallback } from "react";

interface WebhookEventEntry {
  id: string;
  finixEventId: string;
  entity: string | null;
  type: string;
  occurredAt: string | null;
  merchantId: string | null;
  identityId: string | null;
  verificationId: string | null;
  onboardingState: string | null;
  verificationState: string | null;
  rawPayloadJson: unknown;
  processedAt: string | null;
  processingStatus: string;
  errorMessage: string | null;
  createdAt: string;
}

const STATUS_STYLES: Record<string, string> = {
  PROCESSED: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-700",
  ERROR: "bg-red-50 text-red-700",
  FAILED: "bg-red-50 text-red-700",
};

export default function FinixWebhookEventsClient({ initialMerchantId }: { initialMerchantId: string }) {
  const [events, setEvents] = useState<WebhookEventEntry[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [merchantId, setMerchantId] = useState(initialMerchantId);
  const [type, setType] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [viewingEvent, setViewingEvent] = useState<WebhookEventEntry | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (merchantId.trim()) params.set("merchantId", merchantId.trim());
    if (type !== "ALL") params.set("type", type);
    if (status !== "ALL") params.set("status", status);
    if (q.trim()) params.set("q", q.trim());
    params.set("sort", sort);
    fetch(`/api/admin/finix-webhook-events?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events || []);
        setTypes(data.types || []);
        setLoading(false);
      });
  }, [q, merchantId, type, status, sort]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Finix Webhook Events</h1>
      <p className="text-sm text-slate-500 mb-6">
        Every raw webhook Finix has sent WGC, in the order received — search by Finix Merchant ID to see exactly what triggered a status
        change or email for a specific organization.
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Finix Merchant ID (e.g. MUxxxxxxxxxx)"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          className="flex-grow min-w-[240px] px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
        />
        <input
          type="text"
          placeholder="Search event id or type…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="flex-grow min-w-[200px] px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none">
          <option value="ALL">All event types</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none">
          <option value="ALL">All statuses</option>
          <option value="PROCESSED">Processed</option>
          <option value="PENDING">Pending</option>
          <option value="ERROR">Error</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as "newest" | "oldest")} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm outline-none">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">Loading…</div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">No webhook events found.</div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="font-bold text-slate-900">{event.type}</p>
                    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${STATUS_STYLES[event.processingStatus] || "bg-slate-100 text-slate-600"}`}>
                      {event.processingStatus}
                    </span>
                    {event.onboardingState && (
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{event.onboardingState}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 truncate">
                    Merchant: <span className="font-mono">{event.merchantId ?? "—"}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">Finix event id: {event.finixEventId}</p>
                  {event.errorMessage && <p className="text-xs text-red-600 mt-1 truncate">{event.errorMessage}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <p className="text-xs text-slate-400">{new Date(event.createdAt).toLocaleString()}</p>
                  {event.occurredAt && <p className="text-[11px] text-slate-300">Finix sent: {new Date(event.occurredAt).toLocaleString()}</p>}
                  <button onClick={() => setViewingEvent(event)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                    View Payload
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={() => setViewingEvent(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 p-5 border-b border-slate-200">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 truncate">{viewingEvent.type}</p>
                <p className="text-xs text-slate-500 mt-1">
                  Merchant: {viewingEvent.merchantId ?? "—"} · {new Date(viewingEvent.createdAt).toLocaleString()}
                </p>
              </div>
              <button onClick={() => setViewingEvent(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none px-1">
                ×
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre className="text-xs bg-slate-50 rounded-lg p-4 whitespace-pre-wrap break-all">{JSON.stringify(viewingEvent.rawPayloadJson, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
