"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

const noSubscribe = () => () => {};
const getOrigin = () => window.location.origin;
const getServerOrigin = () => "";

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  requestCount: number;
  errorCount: number;
  lastErrorAt: string | null;
}

interface ListResponse {
  keys?: KeyRow[];
  environment?: string;
  error?: string;
}

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "never");
const inputClass = "rounded-lg border border-slate-200 px-3 py-2 text-sm";
const buttonClass = "rounded-lg bg-[#010409] text-white text-sm font-semibold px-4 py-2 disabled:opacity-60";

export default function PartnerApiKeysPanel() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [environment, setEnvironment] = useState("");
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/partner/api-keys")
      .then((r) => r.json() as Promise<ListResponse>)
      .then((data) => {
        if (cancelled) return;
        if (data.error) setMessage({ text: data.error, error: true });
        else {
          setKeys(data.keys ?? []);
          setEnvironment(data.environment ?? "");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const res = await fetch("/api/partner/api-keys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setMessage({ text: data.error || "Couldn't create the key.", error: true });
    setNewKey(data.key);
    setCopied(false);
    setName("");
    setReloadKey((k) => k + 1);
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/partner/api-keys/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    setMessage(res.ok ? { text: "Key revoked. It stopped working immediately.", error: false } : { text: data.error || "Couldn't revoke the key.", error: true });
    setReloadKey((k) => k + 1);
  }

  async function copy() {
    if (!newKey) return;
    try {
      await navigator.clipboard.writeText(newKey);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  // The server renders without an address; the browser fills in the real one, with no hydration mismatch.
  const base = useSyncExternalStore(noSubscribe, getOrigin, getServerOrigin);

  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className={`text-sm ${message.error ? "text-red-600" : "text-green-700"}`}>
          {message.text}
        </p>
      )}

      {newKey && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
          <p className="text-sm font-semibold text-amber-900">Copy your new key now. For your security it won&apos;t be shown again.</p>
          <code className="block break-all rounded-lg bg-white border border-amber-200 px-3 py-2 text-sm" data-testid="new-api-key">
            {newKey}
          </code>
          <div className="flex gap-3">
            <button type="button" onClick={copy} className={buttonClass}>
              {copied ? "Copied" : "Copy key"}
            </button>
            <button type="button" onClick={() => setNewKey(null)} className="text-sm font-semibold text-slate-700">
              I&apos;ve saved it
            </button>
          </div>
        </div>
      )}

      <form onSubmit={create} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="key-name" className="block text-xs font-semibold text-slate-600 mb-1">
            Key name
          </label>
          <input id="key-name" required placeholder="e.g. Reporting" value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} w-64`} />
        </div>
        <button type="submit" className={buttonClass}>
          Create {environment ? `${environment.toLowerCase()} ` : ""}key
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-500 border-b border-slate-100">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Key</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Last used</th>
              <th className="px-4 py-3 font-semibold text-right">Requests</th>
              <th className="px-4 py-3 font-semibold text-right">Errors</th>
              <th className="px-4 py-3 font-semibold">Last error</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {keys.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-slate-500">
                  No keys yet.
                </td>
              </tr>
            ) : (
              keys.map((k) => (
                <tr key={k.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-semibold text-slate-900">{k.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{k.keyPrefix}</td>
                  <td className="px-4 py-3 text-slate-600">{k.status === "ACTIVE" ? "Active" : `Revoked ${dateFmt(k.revokedAt)}`}</td>
                  <td className="px-4 py-3 text-slate-600">{dateFmt(k.lastUsedAt)}</td>
                  <td className="px-4 py-3 text-right text-slate-900">{k.requestCount.toLocaleString("en-US")}</td>
                  <td className={`px-4 py-3 text-right ${k.errorCount > 0 ? "text-red-600 font-semibold" : "text-slate-900"}`}>
                    {k.errorCount.toLocaleString("en-US")}
                    {k.requestCount > 0 && k.errorCount > 0 ? ` (${Math.round((k.errorCount / k.requestCount) * 100)}%)` : ""}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{dateFmt(k.lastErrorAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {k.status === "ACTIVE" && (
                      <button type="button" onClick={() => revoke(k.id)} className="text-xs font-semibold text-red-600">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">Using your key</h3>
        <p className="text-sm text-slate-600">
          One key reads the data of all your organizations. Send it as a Bearer token. Gifts come in pages: keep calling with the <code>nextCursor</code> until it is empty.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-slate-900 text-slate-100 text-xs p-4">{`curl "${base}/api/v1/partner/organizations" \\
  -H "Authorization: Bearer YOUR_KEY"

curl "${base}/api/v1/partner/ledger?from=2026-01-01&to=2026-02-01" \\
  -H "Authorization: Bearer YOUR_KEY"`}</pre>
      </div>
    </div>
  );
}
