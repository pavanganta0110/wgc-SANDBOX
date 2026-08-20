"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, CheckCircle2, XCircle, RefreshCw, Package, FlaskConical } from "lucide-react";

interface StatusResponse {
  enabled: boolean;
  mode?: "mock" | "live";
  connection: { status: string; connectionType: string; storeId: string | null; lastConnectedAt: string | null; lastSyncAt: string | null; lastSyncStatus: string | null; lastSyncError: string | null } | null;
  productCount?: number;
}

const STATUS_LABEL: Record<string, string> = {
  NOT_CONNECTED: "Not Connected",
  CONNECTING: "Connecting…",
  CONNECTED: "Connected",
  ERROR: "Connection Error",
  DISCONNECTED: "Disconnected",
};

export default function PrintfulConnectionCard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [privateToken, setPrivateToken] = useState("");

  const load = useCallback(() => {
    fetch("/api/merchant/settings/integrations/printful")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ enabled: false, connection: null }));
  }, []);

  useEffect(() => { load(); }, [load]);

  const call = async (action: string, path: string, body?: Record<string, unknown>) => {
    setBusy(action);
    try {
      const res = await fetch(path, { method: "POST", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.error || result.message || "Something went wrong.");
      toast.success(
        action === "connect" ? `Connected to Printful${result.connection?.connectionType === "mock" ? " (Mock / Sandbox)" : ""}.` : action === "disconnect" ? "Disconnected." : action === "test" ? "Connection is healthy." : `Sync complete — ${result.received ?? 0} products received.`
      );
      setPrivateToken("");
      load();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  if (!data) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!data.enabled) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Merchandise is not available in this environment.</div>;
  }

  const status = data.connection?.status || "NOT_CONNECTED";
  const isConnected = status === "CONNECTED";
  const isMock = data.mode === "mock";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Package className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Printful</h3>
              <p className="text-xs text-slate-500">Merchandise fulfillment for your giving page.</p>
            </div>
          </div>
          {isMock && (
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold uppercase tracking-wide">
              <FlaskConical className="w-3 h-3" /> Mock / Sandbox
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 mb-6">
          {isConnected ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : status === "ERROR" ? <XCircle className="w-4 h-4 text-red-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-900">{STATUS_LABEL[status] || status}</span>
          {data.connection?.storeId && <span className="text-xs text-slate-400">· Store {data.connection.storeId}</span>}
        </div>

        {data.connection?.lastSyncAt && (
          <p className="text-xs text-slate-500 mb-4">
            Last synced {new Date(data.connection.lastSyncAt).toLocaleString()} — {data.connection.lastSyncStatus} {data.connection.lastSyncError ? `(${data.connection.lastSyncError})` : ""}
          </p>
        )}

        {!isConnected && !isMock && (
          <div className="mb-4 space-y-2">
            <label htmlFor="printful-token" className="block text-xs font-semibold text-slate-700">
              Printful Store API Token
            </label>
            <p className="text-xs text-slate-500">
              Find this in your Printful account under Settings → Stores → your store → API. Check at least one "View" scope. It's validated against Printful before anything is saved, and stored encrypted.
            </p>
            <input
              id="printful-token"
              type="password"
              autoComplete="off"
              value={privateToken}
              onChange={(e) => setPrivateToken(e.target.value)}
              placeholder="Paste your Printful API token"
              className="w-full max-w-md px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <button
              onClick={() => call("connect", "/api/merchant/settings/integrations/printful/connect", isMock ? undefined : { privateToken })}
              disabled={busy !== null || (!isMock && !privateToken.trim())}
              className="px-5 py-2.5 rounded-xl font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2 text-sm"
            >
              {busy === "connect" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Connect Printful
            </button>
          ) : (
            <>
              <button onClick={() => call("sync", "/api/merchant/settings/integrations/printful/sync")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm">
                {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync Products
              </button>
              <button onClick={() => call("test", "/api/merchant/settings/integrations/printful/test")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-sm">
                Test Connection
              </button>
              <button onClick={() => call("disconnect", "/api/merchant/settings/integrations/printful/disconnect")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-sm">
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>

      {isConnected && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">{data.productCount ?? 0} products synced</p>
            <p className="text-xs text-slate-500">Manage which products are active and visible on your giving pages.</p>
          </div>
          <Link href="/merchant/merchandise" className="px-5 py-2.5 rounded-xl font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 text-sm">
            Manage Products
          </Link>
        </div>
      )}
    </div>
  );
}
