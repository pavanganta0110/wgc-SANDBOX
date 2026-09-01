"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Landmark } from "lucide-react";

interface StatusResponse {
  enabled: boolean;
  configured: boolean;
  connection: {
    status: string;
    realmId: string | null;
    companyName: string | null;
    connectedAt: string | null;
    lastConnectionTestAt: string | null;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    lastErrorMessage: string | null;
    refreshTokenExpiresAt: string | null;
  } | null;
}

const STATUS_LABEL: Record<string, string> = {
  NOT_CONNECTED: "Not Connected",
  CONNECTING: "Connecting…",
  CONNECTED: "Connected",
  REAUTHENTICATION_REQUIRED: "Reconnection Required",
  ERROR: "Connection Error",
  DISCONNECTED: "Disconnected",
};

interface BackfillJob {
  id: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED";
  totalCount: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
}

export default function QuickBooksConnectionCard() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [backfillJob, setBackfillJob] = useState<BackfillJob | null>(null);

  const load = useCallback(() => {
    fetch("/api/merchant/settings/integrations/quickbooks")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ enabled: false, configured: false, connection: null }));
  }, []);

  useEffect(() => {
    load();
    // Surface the callback route's redirect result once, then clean the URL.
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "true") {
      toast.success("Connected to QuickBooks.");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("error")) {
      toast.error(params.get("error") || "Could not connect to QuickBooks.");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [load]);

  const call = async (action: "disconnect" | "test") => {
    setBusy(action);
    try {
      const res = await fetch(`/api/merchant/settings/integrations/quickbooks/${action}`, { method: "POST" });
      const result = await res.json();
      if (!res.ok || result.success === false) throw new Error(result.error || result.message || "Something went wrong.");
      toast.success(action === "disconnect" ? "Disconnected." : "Connection is healthy.");
      load();
    } catch (err: any) {
      toast.error(err.message || "Something went wrong.");
    } finally {
      setBusy(null);
    }
  };

  const runBackfill = async () => {
    setBusy("backfill");
    try {
      const createRes = await fetch("/api/merchant/settings/integrations/quickbooks/backfill", { method: "POST" });
      const createData = await createRes.json();
      if (!createRes.ok) throw new Error(createData.error || "Failed to start syncing past transactions.");
      let current: BackfillJob = createData.job;
      setBackfillJob(current);

      while (current.status === "PENDING" || current.status === "RUNNING") {
        const stepRes = await fetch(`/api/merchant/settings/integrations/quickbooks/backfill/${current.id}/process`, { method: "POST" });
        const stepData = await stepRes.json();
        if (!stepRes.ok) throw new Error(stepData.error || "Syncing past transactions failed.");
        current = stepData.job;
        setBackfillJob(current);
      }

      if (current.totalCount === 0) {
        toast.success("Everything is already synced — nothing to backfill.");
      } else {
        const parts = [`${current.succeededCount} synced`];
        if (current.failedCount > 0) parts.push(`${current.failedCount} failed`);
        if (current.skippedCount > 0) parts.push(`${current.skippedCount} skipped`);
        toast.success(`Past transactions: ${parts.join(", ")}`);
      }
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to sync past transactions.");
    } finally {
      setBusy(null);
      setBackfillJob(null);
    }
  };

  if (!data) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">Loading…</div>;
  }

  if (!data.enabled) {
    return <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center text-sm text-slate-500">QuickBooks is not available in this environment.</div>;
  }

  const status = data.connection?.status || "NOT_CONNECTED";
  const isConnected = status === "CONNECTED";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-slate-700" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">QuickBooks Online</h3>
              <p className="text-xs text-slate-500">Sync contributions and customers into your QuickBooks accounting.</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          {isConnected ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : status === "ERROR" || status === "REAUTHENTICATION_REQUIRED" ? <XCircle className="w-4 h-4 text-red-600" /> : <XCircle className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-slate-900">{STATUS_LABEL[status] || status}</span>
          {data.connection?.companyName && <span className="text-xs text-slate-400">· {data.connection.companyName}</span>}
        </div>

        {!data.configured && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 text-amber-800 text-xs p-3">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>QuickBooks isn't configured for this environment yet. WGC needs to register an app with Intuit before organizations can connect.</span>
          </div>
        )}

        {data.connection?.lastErrorMessage && (
          <p className="text-xs text-red-600 mb-4">{data.connection.lastErrorMessage}</p>
        )}

        {data.connection?.lastConnectionTestAt && (
          <p className="text-xs text-slate-500 mb-4">
            Last checked {new Date(data.connection.lastConnectionTestAt).toLocaleString()}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {!isConnected ? (
            <a
              href="/api/merchant/settings/integrations/quickbooks/connect"
              aria-disabled={!data.configured}
              className={`px-5 py-2.5 rounded-xl font-bold text-white text-sm ${data.configured ? "bg-slate-900 hover:bg-slate-800" : "bg-slate-300 pointer-events-none"}`}
            >
              Connect QuickBooks
            </a>
          ) : (
            <>
              <button onClick={() => call("test")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2 text-sm">
                {busy === "test" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Test Connection
              </button>
              <button onClick={runBackfill} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-2 text-sm">
                {busy === "backfill" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {busy === "backfill" && backfillJob ? `Syncing ${backfillJob.processedCount}/${backfillJob.totalCount}…` : busy === "backfill" ? "Starting…" : "Sync Past Transactions"}
              </button>
              <button onClick={() => call("disconnect")} disabled={busy !== null} className="px-5 py-2.5 rounded-xl font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-sm">
                {busy === "disconnect" ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Disconnect
              </button>
            </>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-4">
          Having trouble connecting or syncing? <Link href="/merchant/support/tickets/new" className="text-blue-600 hover:underline">Contact Support</Link>.
        </p>
      </div>
    </div>
  );
}
