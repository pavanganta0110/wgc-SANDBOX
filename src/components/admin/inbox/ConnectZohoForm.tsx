"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ConnectZohoForm({ configured, additional = false }: { configured: boolean; additional?: boolean }) {
  const router = useRouter();
  const [grantCode, setGrantCode] = useState("");
  const [dataCenter, setDataCenter] = useState("com");
  const [label, setLabel] = useState("");
  const [ownKeys, setOwnKeys] = useState(additional);
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/inbox/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantCode, dataCenter, label, ...(ownKeys ? { clientId, clientSecret } : {}) }) });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || "Could not connect");
    setGrantCode("");
    setClientSecret("");
    router.refresh();
  }

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
      <h3 className="text-lg font-bold text-slate-900">{additional ? "Connect another mailbox" : "Connect your Zoho mailbox"}</h3>
      {!configured && !ownKeys && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          First add <code>ZOHO_CLIENT_ID</code> and <code>ZOHO_CLIENT_SECRET</code> to the app environment (steps below), then redeploy.
        </p>
      )}
      <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
        <li>Open <b>api-console.zoho.com</b> (use your Zoho region&apos;s console) and add a <b>Self Client</b>.</li>
        <li>Copy its Client ID and Client Secret into <code>ZOHO_CLIENT_ID</code> / <code>ZOHO_CLIENT_SECRET</code> in Vercel, then redeploy.</li>
        <li>In the Self Client, open <b>Generate Code</b>. Scope: <code>ZohoMail.accounts.READ,ZohoMail.messages.ALL,ZohoMail.folders.READ</code>. Choose 10 minutes.</li>
        <li>Paste the code below and press Connect. The code works once.</li>
      </ol>
      <p className="text-sm text-slate-600">
        Each mailbox belongs to one Zoho login. If this mailbox is under a different Zoho login than the others, do steps 1 to 3 while signed in as that login and enter its own Client ID and Secret below.
      </p>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={ownKeys} onChange={(e) => setOwnKeys(e.target.checked)} /> This mailbox uses its own Client ID and Secret
      </label>
      {ownKeys && (
        <div className="flex flex-wrap gap-2">
          <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID" className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret" className="min-w-[14rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
      )}
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder='Name for this mailbox, e.g. "Support" or "Company"' className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
      <div className="flex flex-wrap items-center gap-2">
        <input value={grantCode} onChange={(e) => setGrantCode(e.target.value)} placeholder="Zoho grant code" className="min-w-[18rem] flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <select value={dataCenter} onChange={(e) => setDataCenter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
          <option value="com">zoho.com (US)</option>
          <option value="eu">zoho.eu</option>
          <option value="in">zoho.in</option>
          <option value="com.au">zoho.com.au</option>
          <option value="jp">zoho.jp</option>
        </select>
        <button onClick={connect} disabled={busy || !grantCode.trim() || (ownKeys && (!clientId.trim() || !clientSecret.trim()))} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Connecting…" : "Connect"}</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
