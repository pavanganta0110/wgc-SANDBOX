"use client";

import { useEffect, useState, useCallback } from "react";
import toast from "react-hot-toast";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  scopesJson: string[];
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ApiKeySettingsPanel() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [availableScopes, setAvailableScopes] = useState<string[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formScopes, setFormScopes] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/merchant/settings/developers/api-keys");
    const data = await res.json();
    if (res.ok) {
      setKeys(data.keys);
      setAvailableScopes(data.availableScopes);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const createKey = async () => {
    if (!formName.trim() || formScopes.length === 0) {
      toast.error("Name and at least one scope are required");
      return;
    }
    const res = await fetch("/api/merchant/settings/developers/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: formName.trim(), scopes: formScopes }),
    });
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.error || "Failed to create API key");
      return;
    }
    setNewKey(data.key);
    setFormName("");
    setFormScopes([]);
    setShowCreate(false);
    void load();
    toast.success("API key created");
  };

  const revokeKey = async (id: string) => {
    if (!confirm("Revoke this API key? Anything using it will stop working immediately.")) return;
    const res = await fetch(`/api/merchant/settings/developers/api-keys/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("API key revoked");
      void load();
    } else {
      toast.error("Failed to revoke key");
    }
  };

  return (
    <div className="space-y-6">
      {newKey && (
        <div className="p-4 rounded-xl border border-amber-300 bg-amber-50">
          <p className="text-sm font-bold text-amber-900 mb-2">Save this API key now — it won&apos;t be shown again:</p>
          <code className="block p-2 bg-white rounded border border-amber-200 text-xs break-all">{newKey}</code>
          <button onClick={() => setNewKey(null)} className="mt-2 text-xs font-semibold text-amber-700 hover:underline">
            I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={() => setShowCreate((v) => !v)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
          {showCreate ? "Cancel" : "Create Key"}
        </button>
      </div>

      {showCreate && (
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Key Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Zapier connection"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-2">Scopes</label>
            <div className="grid grid-cols-2 gap-2">
              {availableScopes.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={formScopes.includes(scope)}
                    onChange={(e) => setFormScopes((prev) => (e.target.checked ? [...prev, scope] : prev.filter((s) => s !== scope)))}
                  />
                  {scope}
                </label>
              ))}
            </div>
          </div>
          <button onClick={createKey} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
            Create Key
          </button>
        </div>
      )}

      {(keys ?? []).length === 0 && keys !== null && <p className="text-sm text-slate-400">No API keys yet.</p>}

      <div className="space-y-2">
        {(keys ?? []).map((k) => (
          <div key={k.id} className="p-4 rounded-xl border border-slate-200 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-bold text-slate-900">{k.name}</span>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    k.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-600"
                  }`}
                >
                  {k.status}
                </span>
              </div>
              <p className="font-mono text-xs text-slate-500">{k.keyPrefix}</p>
              <p className="text-xs text-slate-400 mt-1">
                Scopes: {k.scopesJson.join(", ")} · Created {new Date(k.createdAt).toLocaleDateString()}
                {k.lastUsedAt ? ` · Last used ${new Date(k.lastUsedAt).toLocaleString()}` : " · Never used"}
              </p>
            </div>
            {k.status === "ACTIVE" && (
              <button onClick={() => revokeKey(k.id)} className="text-xs font-semibold text-red-600 hover:underline shrink-0">
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
