"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";

interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  status: string;
  subscribedEventsJson: string[];
  signingSecretLast4: string;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
  disabledReason: string | null;
}

interface Delivery {
  id: string;
  status: string;
  attemptCount: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  createdAt: string;
  event: { type: string; dataJson: unknown; createdAt: string } | null;
}

export default function WebhookSettingsPanel() {
  const [endpoints, setEndpoints] = useState<WebhookEndpoint[] | null>(null);
  const [availableEvents, setAvailableEvents] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/merchant/settings/developers/webhooks");
    const data = await res.json();
    if (res.ok) {
      setEndpoints(data.endpoints);
      setAvailableEvents(data.availableEvents);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEvents, setFormEvents] = useState<string[]>([]);

  const createEndpoint = async () => {
    if (!formUrl.trim() || formEvents.length === 0) {
      toast.error("URL and at least one event are required");
      return;
    }
    const res = await fetch("/api/merchant/settings/developers/webhooks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: formUrl.trim(), description: formDescription.trim(), subscribedEvents: formEvents }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to create webhook");
      return;
    }
    setNewSecret(data.signingSecret);
    setFormUrl("");
    setFormDescription("");
    setFormEvents([]);
    setShowCreate(false);
    void load();
    toast.success("Webhook endpoint created");
  };

  const toggleStatus = async (endpoint: WebhookEndpoint) => {
    const res = await fetch(`/api/merchant/settings/developers/webhooks/${endpoint.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: endpoint.status === "ACTIVE" ? "DISABLED" : "ACTIVE" }),
    });
    if (res.ok) void load();
    else toast.error("Failed to update endpoint");
  };

  const deleteEndpoint = async (id: string) => {
    if (!confirm("Delete this webhook endpoint? This cannot be undone.")) return;
    const res = await fetch(`/api/merchant/settings/developers/webhooks/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Webhook deleted");
      void load();
    } else {
      toast.error("Failed to delete endpoint");
    }
  };

  const rotateSecret = async (id: string) => {
    if (!confirm("Rotate the signing secret? Anything using the old secret will stop verifying until updated.")) return;
    const res = await fetch(`/api/merchant/settings/developers/webhooks/${id}/rotate-secret`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setNewSecret(data.signingSecret);
      void load();
    } else {
      toast.error("Failed to rotate secret");
    }
  };

  const sendTest = async (id: string) => {
    const res = await fetch(`/api/merchant/settings/developers/webhooks/${id}/test`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      toast.success(data.delivery?.status === "SUCCEEDED" ? "Test event delivered successfully" : `Test event sent — status: ${data.delivery?.status}`);
      if (expandedId === id) loadDeliveries(id);
    } else {
      toast.error("Failed to send test event");
    }
  };

  const loadDeliveries = async (id: string) => {
    const res = await fetch(`/api/merchant/settings/developers/webhooks/${id}/deliveries`);
    const data = await res.json();
    if (res.ok) setDeliveries(data.deliveries);
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDeliveries(null);
    } else {
      setExpandedId(id);
      setDeliveries(null);
      void loadDeliveries(id);
    }
  };

  const retryDelivery = async (deliveryId: string, endpointId: string) => {
    const res = await fetch(`/api/merchant/settings/developers/webhooks/deliveries/${deliveryId}/retry`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      toast.success(data.delivery?.status === "SUCCEEDED" ? "Retry succeeded" : `Retry status: ${data.delivery?.status}`);
      loadDeliveries(endpointId);
    } else {
      toast.error(data.error || "Retry failed");
    }
  };

  return (
    <div className="space-y-6">
      {newSecret && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50">
          <p className="text-sm font-bold text-amber-900 mb-2">Save this signing secret now — it won&apos;t be shown again:</p>
          <code className="block p-2 bg-white rounded border border-amber-200 text-xs break-all">{newSecret}</code>
          <button onClick={() => setNewSecret(null)} className="mt-2 text-xs font-semibold text-amber-700 hover:underline">
            I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
        >
          {showCreate ? "Cancel" : "Add Endpoint"}
        </button>
      </div>

      {showCreate && (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Endpoint URL (https://)</label>
            <input
              type="url"
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="https://example.com/webhooks/wgc"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Zapier integration"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Events</label>
            <div className="grid grid-cols-2 gap-2">
              {availableEvents.map((evt) => (
                <label key={evt} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={formEvents.includes(evt)}
                    onChange={(e) =>
                      setFormEvents((prev) => (e.target.checked ? [...prev, evt] : prev.filter((x) => x !== evt)))
                    }
                  />
                  {evt}
                </label>
              ))}
            </div>
          </div>
          <button onClick={createEndpoint} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Create Endpoint
          </button>
        </div>
      )}

      {(endpoints ?? []).length === 0 && endpoints !== null && (
        <p className="text-sm text-slate-400">No webhook endpoints configured yet.</p>
      )}

      <div className="space-y-3">
        {(endpoints ?? []).map((ep) => (
          <div key={ep.id} className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm text-slate-900 truncate">{ep.url}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                      ep.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
                    }`}
                  >
                    {ep.status}
                  </span>
                </div>
                {ep.description && <p className="text-xs text-slate-500 mb-1">{ep.description}</p>}
                <p className="text-xs text-slate-400">
                  Secret ends in ...{ep.signingSecretLast4} · Events: {ep.subscribedEventsJson.join(", ")}
                </p>
                {ep.disabledReason && <p className="text-xs text-red-600 mt-1">{ep.disabledReason}</p>}
              </div>
              <div className="flex flex-col gap-1 shrink-0 items-end">
                <div className="flex gap-2">
                  <button onClick={() => sendTest(ep.id)} className="text-xs font-semibold text-indigo-600 hover:underline">Send Test</button>
                  <button onClick={() => toggleExpand(ep.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    {expandedId === ep.id ? "Hide History" : "History"}
                  </button>
                  <button onClick={() => rotateSecret(ep.id)} className="text-xs font-semibold text-slate-500 hover:underline">Rotate Secret</button>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => toggleStatus(ep)} className="text-xs font-semibold text-slate-500 hover:underline">
                    {ep.status === "ACTIVE" ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => deleteEndpoint(ep.id)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
                </div>
              </div>
            </div>

            {expandedId === ep.id && (
              <div className="border-t border-slate-100 bg-slate-50 p-4">
                <h4 className="text-xs font-bold text-slate-700 mb-2">Delivery History</h4>
                {deliveries === null ? (
                  <p className="text-xs text-slate-400">Loading...</p>
                ) : deliveries.length === 0 ? (
                  <p className="text-xs text-slate-400">No deliveries yet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-1 pr-2">Event</th>
                        <th className="py-1 pr-2">Status</th>
                        <th className="py-1 pr-2">Response</th>
                        <th className="py-1 pr-2">Attempts</th>
                        <th className="py-1 pr-2">Last Attempt</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {deliveries.map((d) => (
                        <tr key={d.id} className="border-t border-slate-200">
                          <td className="py-1.5 pr-2 font-mono">{d.event?.type ?? "—"}</td>
                          <td className="py-1.5 pr-2">
                            <span
                              className={
                                d.status === "SUCCEEDED"
                                  ? "text-green-700 font-semibold"
                                  : d.status === "ABANDONED"
                                    ? "text-red-600 font-semibold"
                                    : "text-amber-600 font-semibold"
                              }
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2">{d.responseStatusCode ?? d.errorMessage ?? "—"}</td>
                          <td className="py-1.5 pr-2">{d.attemptCount}</td>
                          <td className="py-1.5 pr-2">{d.lastAttemptAt ? new Date(d.lastAttemptAt).toLocaleString() : "—"}</td>
                          <td className="py-1.5">
                            {d.status !== "SUCCEEDED" && (
                              <button onClick={() => retryDelivery(d.id, ep.id)} className="text-indigo-600 hover:underline font-semibold">
                                Retry
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
