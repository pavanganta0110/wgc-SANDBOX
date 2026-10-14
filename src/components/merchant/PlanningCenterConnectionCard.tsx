"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Users } from "lucide-react";

interface StatusResponse {
  enabled: boolean;
  configured: boolean;
  connection: {
    status: string;
    organizationName: string | null;
    connectedByName: string | null;
    connectedAt: string | null;
    lastConnectionTestAt: string | null;
    lastErrorMessage: string | null;
    refreshTokenExpiresAt: string | null;
    canReadGiving: boolean | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  NOT_CONNECTED: "Not Connected",
  CONNECTED: "Connected",
  REAUTHENTICATION_REQUIRED: "Reconnection Required",
  ERROR: "Connection Error",
  DISCONNECTED: "Disconnected",
};

export default function PlanningCenterConnectionCard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/merchant/settings/integrations/planning-center")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ enabled: false, configured: false, connection: null }));
  }, []);

  useEffect(() => {
    load();
    // Surface the callback route's redirect result once, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("Connected to Planning Center. Setting up your funds and gift sending…");
      // WGC finishes the setup right after the redirect; refresh the panels below while it does.
      [3000, 7000, 12000, 20000, 30000].forEach((ms) => window.setTimeout(() => window.dispatchEvent(new Event("pco-connection-changed")), ms));
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error")) {
      toast.error(params.get("error") || "Could not connect to Planning Center.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load]);

  const call = async (action: "disconnect" | "test") => {
    if (action === "disconnect" && !window.confirm("Disconnect Planning Center? WGC will stop being able to reach your Planning Center account.")) return;
    setBusy(action);
    try {
      const res = await fetch(`/api/merchant/settings/integrations/planning-center/${action}`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.error || result.message || "Something went wrong.");
      toast.success(action === "disconnect" ? "Disconnected." : result.message || "Connection is healthy.");
      load();
      window.dispatchEvent(new Event("pco-connection-changed"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      load();
      window.dispatchEvent(new Event("pco-connection-changed"));
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!data.enabled) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Planning Center is not available in this environment.</div>;
  }

  const status = data.connection?.status || "NOT_CONNECTED";
  const isConnected = status === "CONNECTED";
  const needsReconnect = status === "REAUTHENTICATION_REQUIRED" || status === "ERROR";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-slate-700" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Planning Center</h3>
            <p className="text-xs text-slate-500">Connect your Planning Center account to WGC Payments.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {isConnected ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : needsReconnect ? <XCircle className="w-4 h-4 text-red-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-900">{STATUS_LABEL[status] || status}</span>
          {data.connection?.organizationName && isConnected && <span className="text-xs text-slate-400">· {data.connection.organizationName}</span>}
        </div>

        {isConnected && data.connection?.connectedByName && (
          <p className="text-xs text-slate-500 mb-2">
            Connected by {data.connection.connectedByName}
            {data.connection.connectedAt ? ` on ${new Date(data.connection.connectedAt).toLocaleDateString()}` : ""}.
          </p>
        )}

        {!data.configured && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Planning Center isn&apos;t configured for this environment yet. WGC needs to register its Planning Center app before organizations can connect.</span>
          </div>
        )}

        {isConnected && data.connection?.canReadGiving === false && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>The Planning Center user who connected can&apos;t access Giving. Reconnect with a finance administrator account so gifts can be shared with Planning Center.</span>
          </div>
        )}

        {needsReconnect && (
          <p className="text-xs text-red-600 mb-4">{data.connection?.lastErrorMessage || "Please reconnect Planning Center."}</p>
        )}

        {data.connection?.lastConnectionTestAt && (
          <p className="text-xs text-slate-500 mb-4">Last checked {new Date(data.connection.lastConnectionTestAt).toLocaleString()}</p>
        )}

        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <a
              href="/api/merchant/settings/integrations/planning-center/connect"
              aria-disabled={!data.configured}
              className={`px-5 py-2.5 rounded-xl font-bold text-white text-sm ${data.configured ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-300 pointer-events-none"}`}
            >
              {needsReconnect ? "Reconnect Planning Center" : "Connect Planning Center"}
            </a>
          ) : (
            <>
              <button onClick={() => call("test")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2 text-sm">
                {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Test Connection
              </button>
              <button onClick={() => call("disconnect")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-sm">
                {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Disconnect
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4">
          Having trouble connecting? <Link href="/merchant/support/tickets/new" className="text-blue-600 hover:underline">Contact Support</Link>.
        </p>
      </div>
    </div>
  );
}
