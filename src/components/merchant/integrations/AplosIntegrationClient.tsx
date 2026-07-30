"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, Loader2, Upload, ShieldAlert } from "lucide-react";
import StateBadge from "@/components/merchant/StateBadge";

/**
 * Merchant-facing Aplos connection experience. Single client component that
 * switches between the connection wizard (no active connection) and the
 * connected-state panel (an active connection exists), driven by
 * GET /status. Credentials are never submitted as multipart/FormData — the
 * private-key file is read client-side via the File API and its text
 * content is sent as a normal JSON string field, so nothing is ever written
 * to disk anywhere in this flow.
 */

interface ConnectionStatus {
  status: string;
  automaticSyncEnabled?: boolean;
  aplosOrganizationId?: string | null;
  aplosOrganizationName?: string | null;
  keyFingerprint?: string | null;
  connectedAt?: string | null;
  lastConnectionTestAt?: string | null;
  lastSuccessfulSyncAt?: string | null;
  lastErrorAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  disconnectedAt?: string | null;
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsText(file);
  });
}

export default function AplosIntegrationClient({ canManage }: { canManage: boolean }) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ConnectionStatus | null>(null);

  const fetchStatus = useCallback(async (): Promise<ConnectionStatus | null> => {
    const res = await fetch("/api/merchant/settings/integrations/aplos/status");
    return res.ok ? await res.json() : null;
  }, []);

  // refreshStatus is exposed to child components (called from button click
  // handlers after a mutating action, e.g. onConnected/onChanged) — that is
  // a legitimate direct setState call outside of an effect body, so it is
  // not flagged. The initial mount fetch below is written as its own
  // effect with an inline async closure, rather than calling refreshStatus
  // directly from the effect body, to avoid react-hooks' "setState
  // synchronously within an effect" warning about calling an
  // already-setState-ful function straight from an effect.
  const refreshStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await fetchStatus());
    } finally {
      setLoading(false);
    }
  }, [fetchStatus]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchStatus();
      if (!cancelled) {
        setStatus(result);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading connection status…
      </div>
    );
  }

  const isConnected = status?.status === "CONNECTED";

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-slate-900">Aplos Integration</h3>
          <StateBadge state={status?.status || "NOT_CONNECTED"} />
        </div>
        <p className="text-xs text-slate-500">
          Connect your Aplos account to automatically send settled contributions from WGC Payments into Aplos. This is
          not an official Aplos partner integration — you connect using credentials your own Aplos administrator
          generates.
        </p>
      </div>

      {isConnected ? (
        <ConnectedPanel status={status!} canManage={canManage} onChanged={refreshStatus} />
      ) : (
        <ConnectionWizard canManage={canManage} priorStatus={status} onConnected={refreshStatus} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connected-state panel
// ---------------------------------------------------------------------------

function ConnectedPanel({
  status,
  canManage,
  onChanged,
}: {
  status: ConnectionStatus;
  canManage: boolean;
  onChanged: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch("/api/merchant/settings/integrations/aplos/test-connection", { method: "POST", body: "{}" });
      const data = await res.json();
      if (data.success) toast.success("Connection verified — Aplos is reachable.");
      else toast.error(data.error || "Connection test failed.");
    } catch {
      toast.error("Could not reach the server to test the connection.");
    } finally {
      setTesting(false);
      onChanged();
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/merchant/settings/integrations/aplos/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (data.success) toast.success("Aplos connection disconnected.");
      else toast.error(data.error || "Could not disconnect.");
    } catch {
      toast.error("Could not reach the server to disconnect.");
    } finally {
      setDisconnecting(false);
      setConfirmingDisconnect(false);
      onChanged();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
      <div className="grid grid-cols-2 gap-y-3 text-sm">
        <div className="text-slate-500">Connection label</div>
        <div className="text-right font-medium text-slate-900">{status.aplosOrganizationName || "—"}</div>
        <div className="text-slate-500">Aplos account identifier</div>
        <div className="text-right font-mono text-xs text-slate-700">{status.aplosOrganizationId || "—"}</div>
        <div className="text-slate-500">Connected key</div>
        <div className="text-right font-mono text-xs text-slate-700">{status.keyFingerprint || "—"}</div>
        <div className="text-slate-500">Automatic sync</div>
        <div className="text-right font-medium text-slate-900">{status.automaticSyncEnabled ? "Enabled" : "Disabled"}</div>
        <div className="text-slate-500">Last successful test</div>
        <div className="text-right font-medium text-slate-900">
          {status.lastConnectionTestAt ? new Date(status.lastConnectionTestAt).toLocaleString() : "Never"}
        </div>
        {status.lastErrorMessage && (
          <>
            <div className="text-slate-500">Last error</div>
            <div className="text-right text-red-600 text-xs">{status.lastErrorMessage}</div>
          </>
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {testing ? "Testing…" : "Test Connection"}
          </button>
          {!confirmingDisconnect ? (
            <button
              onClick={() => setConfirmingDisconnect(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Disconnect
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">Disconnect and remove the stored credential?</span>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Confirm Disconnect"}
              </button>
              <button onClick={() => setConfirmingDisconnect(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
      {!canManage && (
        <p className="text-xs text-slate-400 pt-2 border-t border-slate-50">
          You have read-only access to this integration. Contact an owner or admin to make changes.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connection wizard (Steps: Intro -> Credentials/Test -> Review/Connect)
// ---------------------------------------------------------------------------

type WizardStep = "intro" | "credentials" | "review";

function ConnectionWizard({
  canManage,
  priorStatus,
  onConnected,
}: {
  canManage: boolean;
  priorStatus: ConnectionStatus | null;
  onConnected: () => void;
}) {
  const [step, setStep] = useState<WizardStep>("intro");
  const [clientId, setClientId] = useState("");
  const [privateKeyMaterial, setPrivateKeyMaterial] = useState("");
  const [privateKeyFileName, setPrivateKeyFileName] = useState<string | null>(null);
  const [aplosAccountId, setAplosAccountId] = useState("");
  const [organizationLabel, setOrganizationLabel] = useState("");
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!canManage) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Not connected</p>
          <p className="text-xs text-slate-500 mt-1">
            An owner or admin needs to connect this organization&apos;s Aplos account. You do not have permission to
            connect, test, or configure this integration.
          </p>
        </div>
      </div>
    );
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16_384) {
      toast.error("That file is larger than expected for an RSA private key.");
      return;
    }
    try {
      const text = await readFileAsText(file);
      setPrivateKeyMaterial(text);
      setPrivateKeyFileName(file.name);
    } catch {
      toast.error("Could not read the selected file.");
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/merchant/settings/integrations/aplos/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, privateKeyMaterial, aplosAccountId }),
      });
      const data = await res.json();
      if (res.status === 400) {
        setTestResult({ success: false, message: data.error || "Invalid credentials." });
      } else if (data.success) {
        setTestResult({ success: true, message: `Verified — Aplos confirmed access to ${data.aplosAccountId}.` });
      } else {
        setTestResult({ success: false, message: data.error || "Connection test failed." });
      }
    } catch {
      setTestResult({ success: false, message: "Could not reach the server to test the connection." });
    } finally {
      setTesting(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/merchant/settings/integrations/aplos/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, privateKeyMaterial, aplosAccountId, organizationLabel }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Aplos connected.");
        onConnected();
      } else {
        toast.error(data.error || "Could not save the connection.");
      }
    } catch {
      toast.error("Could not reach the server to save the connection.");
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
      {priorStatus?.lastErrorMessage && priorStatus.status !== "NOT_CONNECTED" && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs">{priorStatus.lastErrorMessage}</div>
      )}

      {step === "intro" && (
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">Connect your Aplos account</h4>
          <p className="text-sm text-slate-600 leading-relaxed mb-4">
            Connect your Aplos account to automatically send settled contributions from WGC Payments into Aplos. An
            Aplos administrator at your organization must generate a Client ID and private key from your Aplos
            account settings once — WGC never uses a shared account across organizations.
          </p>
          <button
            onClick={() => setStep("credentials")}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800"
          >
            Get Started
          </button>
        </div>
      )}

      {step === "credentials" && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Connection credentials</h4>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Aplos Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="a1b2c3d4-e5f6-g7h8-i9j0-k1l2m3n4o5p6"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Private key file</label>
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-slate-300 text-sm text-slate-600 cursor-pointer hover:border-slate-400">
              <Upload className="w-4 h-4" />
              {privateKeyFileName || "Choose file…"}
              <input type="file" className="hidden" onChange={handleFileChange} />
            </label>
            <p className="text-xs text-slate-400 mt-1">Never leaves this form unencrypted — read locally and encrypted immediately on our server.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Aplos organization/account identifier</label>
            <input
              value={aplosAccountId}
              onChange={(e) => setAplosAccountId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTest}
              disabled={testing || !clientId || !privateKeyMaterial || !aplosAccountId}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {testing ? "Testing…" : "Test Connection"}
            </button>
            <button onClick={() => setStep("intro")} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50">
              Cancel
            </button>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 p-3 rounded-xl text-sm ${testResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
              {testResult.message}
            </div>
          )}

          {testResult?.success && (
            <button
              onClick={() => setStep("review")}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800"
            >
              Continue
            </button>
          )}
        </div>
      )}

      {step === "review" && (
        <div className="space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Review and connect</h4>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Label this connection (optional)</label>
            <input
              value={organizationLabel}
              onChange={(e) => setOrganizationLabel(e.target.value)}
              placeholder="e.g. First Community Church"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
            <p className="text-xs text-slate-400 mt-1">
              A name of your choosing to identify this connection — Aplos does not provide an organization name via
              this verification.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm p-4 rounded-xl bg-slate-50">
            <div className="text-slate-500">Aplos account identifier</div>
            <div className="text-right font-mono text-xs">{aplosAccountId}</div>
            <div className="text-slate-500">Connection status</div>
            <div className="text-right text-green-700 font-semibold">Verified</div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {connecting ? "Connecting…" : "Enable Connection"}
            </button>
            <button onClick={() => setStep("credentials")} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-50">
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
