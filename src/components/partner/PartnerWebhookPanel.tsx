"use client";

import { useEffect, useRef, useState } from "react";

interface Endpoint {
  id: string;
  url: string;
  status: string;
  subscribedEventsJson: string[];
  signingSecretLast4: string;
  disabledReason: string | null;
  consecutiveFailures: number;
  lastDeliveryAt: string | null;
  lastSuccessAt: string | null;
}
interface DeliveryRow {
  id: string;
  eventType: string | null;
  organizationName: string | null;
  status: string;
  attemptCount: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  createdAt: string;
}
interface WebhookResponse {
  endpoint?: Endpoint | null;
  deliveries?: DeliveryRow[];
  last24h?: { succeeded: number; failed: number };
  availableEvents?: string[];
  defaultEvents?: string[];
  error?: string;
}

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
const inputClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";
const statusLabel: Record<string, string> = { ACTIVE: "Active", DISABLED: "Turned off", DISABLED_AUTO: "Turned off after repeated failures" };

export default function PartnerWebhookPanel() {
  const [data, setData] = useState<WebhookResponse | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [secret, setSecret] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const filledFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/webhook")
      .then((r) => r.json() as Promise<WebhookResponse>)
      .then((d) => {
        if (cancelled) return;
        if (d.error) return setMessage({ text: d.error, error: true });
        setData(d);
        // Fill the form once per endpoint, from what is saved (or the defaults for a new one).
        const key = d.endpoint?.id ?? "new";
        if (filledFor.current !== key) {
          filledFor.current = key;
          setUrl(d.endpoint?.url ?? "");
          setEvents(d.endpoint?.subscribedEventsJson ?? d.defaultEvents ?? []);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const reload = () => setReloadKey((k) => k + 1);
  const endpoint = data?.endpoint ?? null;

  async function save(enabled = true) {
    setMessage(null);
    const res = await fetch("/api/partner/webhook", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, events, enabled }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ text: body.error || "Couldn't save.", error: true });
    if (body.signingSecret) setSecret(body.signingSecret);
    setMessage({ text: endpoint ? "Saved." : "Webhook created.", error: false });
    reload();
  }

  async function rotate() {
    const res = await fetch("/api/partner/webhook/rotate-secret", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ text: body.error || "Couldn't rotate the secret.", error: true });
    setSecret(body.signingSecret);
    reload();
  }

  async function sendTest() {
    setMessage(null);
    const res = await fetch("/api/partner/webhook/test", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    setMessage(
      body.ok
        ? { text: `Test event delivered (HTTP ${body.statusCode}).`, error: false }
        : { text: `Test event failed: ${body.error || "no response"}.`, error: true }
    );
    reload();
  }

  const toggle = (type: string) => setEvents((cur) => (cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type]));

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      {secret && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-900">Copy your signing secret now. It won&apos;t be shown again.</p>
          <code className="block break-all rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm" data-testid="webhook-secret">
            {secret}
          </code>
          <button type="button" onClick={() => setSecret(null)} className="text-sm font-semibold text-slate-700">
            I&apos;ve saved it
          </button>
        </div>
      )}

      {endpoint && (
        <div className="grid gap-4 sm:grid-cols-4">
          <Stat label="Status" value={statusLabel[endpoint.status] ?? endpoint.status} tone={endpoint.status === "ACTIVE" ? "good" : "bad"} />
          <Stat label="Delivered, last 24h" value={String(data?.last24h?.succeeded ?? 0)} tone="good" />
          <Stat label="Failed, last 24h" value={String(data?.last24h?.failed ?? 0)} tone={(data?.last24h?.failed ?? 0) > 0 ? "bad" : "neutral"} />
          <Stat label="Last success" value={dateFmt(endpoint.lastSuccessAt)} tone="neutral" />
        </div>
      )}
      {endpoint?.disabledReason && <p className="text-sm text-red-600">{endpoint.disabledReason}. Save again to turn it back on.</p>}

      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-bold text-slate-900">{endpoint ? "Your webhook" : "Set up your webhook"}</h3>
        <div>
          <label htmlFor="webhook-url" className="block text-xs font-semibold text-slate-600 mb-1">
            Endpoint URL (https)
          </label>
          <input id="webhook-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/wgc-webhook" className={`${inputClass} w-full max-w-xl`} />
        </div>
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-600 mb-2">Events to send</legend>
          <div className="grid gap-1 sm:grid-cols-2">
            {(data?.availableEvents ?? []).map((type) => (
              <label key={type} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={events.includes(type)} onChange={() => toggle(type)} />
                {type}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => save(true)} className={buttonClass}>
            {endpoint ? "Save" : "Create webhook"}
          </button>
          {endpoint && (
            <>
              <button type="button" onClick={sendTest} className="rounded-lg border border-slate-200 text-sm font-semibold px-4 py-2">
                Send test event
              </button>
              <button type="button" onClick={rotate} className="rounded-lg border border-slate-200 text-sm font-semibold px-4 py-2">
                Rotate secret (…{endpoint.signingSecretLast4})
              </button>
              {endpoint.status === "ACTIVE" && (
                <button type="button" onClick={() => save(false)} className="text-sm font-semibold text-red-600 px-2">
                  Turn off
                </button>
              )}
            </>
          )}
        </div>
      </section>

      {endpoint && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
          <h3 className="text-sm font-bold text-slate-900 px-4 pt-4">Recent deliveries</h3>
          <table className="w-full text-sm mt-2">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Event</th>
                <th className="px-4 py-3 font-semibold">Organization</th>
                <th className="px-4 py-3 font-semibold">Result</th>
                <th className="px-4 py-3 font-semibold text-right">Attempts</th>
              </tr>
            </thead>
            <tbody>
              {(data?.deliveries ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-slate-500">
                    No deliveries yet.
                  </td>
                </tr>
              ) : (
                (data?.deliveries ?? []).map((d) => (
                  <tr key={d.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-3 text-slate-600">{dateFmt(d.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-900">{d.eventType ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{d.organizationName ?? "—"}</td>
                    <td className={`px-4 py-3 ${d.status === "SUCCEEDED" ? "text-green-700" : "text-red-600"}`}>
                      {d.status === "SUCCEEDED" ? `Delivered (HTTP ${d.responseStatusCode})` : d.status === "PENDING" ? "Sending…" : `${d.status === "ABANDONED" ? "Gave up" : "Retrying"}: ${d.errorMessage ?? "failed"}`}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">{d.attemptCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "neutral" }) {
  const color = tone === "good" ? "text-green-700" : tone === "bad" ? "text-red-600" : "text-slate-900";
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
      <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">{label}</p>
      <p className={`mt-1 text-sm font-bold ${color}`}>{value}</p>
    </div>
  );
}
