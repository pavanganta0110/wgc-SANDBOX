"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

interface Keyword {
  id: string;
  keyword: string;
  fundraisingCampaignId: string | null;
  replyMessageTemplate: string | null;
  status: string;
}

interface Campaign {
  id: string;
  name: string;
}

export default function TextToGiveSettingsPanel() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [smsLive, setSmsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newKeyword, setNewKeyword] = useState("");
  const [newCampaignId, setNewCampaignId] = useState("");
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [kwRes, campaignRes] = await Promise.all([fetch("/api/merchant/text-to-give/keywords"), fetch("/api/merchant/campaigns?status=ACTIVE")]);
      const kwData = await kwRes.json();
      const campaignData = await campaignRes.json();
      setKeywords(kwData.keywords ?? []);
      setSmsLive(Boolean(kwData.smsLive));
      setCampaigns(campaignData.campaigns ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, []);

  const createKeyword = async () => {
    if (!newKeyword.trim() || !newCampaignId) {
      toast.error("Pick a campaign and enter a keyword.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/merchant/text-to-give/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: newKeyword, fundraisingCampaignId: newCampaignId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create keyword");
      toast.success(`"${data.keyword.keyword}" created`);
      setNewKeyword("");
      setNewCampaignId("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create keyword");
    } finally {
      setCreating(false);
    }
  };

  const toggleStatus = async (kw: Keyword) => {
    const nextStatus = kw.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
    const res = await fetch(`/api/merchant/text-to-give/keywords/${kw.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) load();
  };

  const deleteKeyword = async (kw: Keyword) => {
    if (!confirm(`Delete keyword "${kw.keyword}"?`)) return;
    const res = await fetch(`/api/merchant/text-to-give/keywords/${kw.id}`, { method: "DELETE" });
    if (res.ok) load();
  };

  const campaignName = (id: string | null) => campaigns.find((c) => c.id === id)?.name ?? "—";

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;

  return (
    <div className="space-y-6">
      {!smsLive && (
        <div className="rounded-lg bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800">
          Text to Give keywords can be set up now, but replies won&rsquo;t actually send yet — donor-facing texting needs its own approved messaging
          campaign with our SMS provider first. We&rsquo;ll let you know the moment it&rsquo;s live.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">Add a Keyword</h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="e.g. BUILDING"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm uppercase"
          />
          <select value={newCampaignId} onChange={(e) => setNewCampaignId(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Select a campaign…</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={createKeyword} disabled={creating} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {creating ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Keyword</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Campaign</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Status</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {keywords.map((kw) => (
              <tr key={kw.id}>
                <td className="px-4 py-3 text-sm font-mono font-semibold">{kw.keyword}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{campaignName(kw.fundraisingCampaignId)}</td>
                <td className="px-4 py-3 text-sm">{kw.status}</td>
                <td className="px-4 py-3 text-sm space-x-3">
                  <button onClick={() => toggleStatus(kw)} className="text-indigo-600 hover:underline">
                    {kw.status === "ACTIVE" ? "Pause" : "Activate"}
                  </button>
                  <button onClick={() => deleteKeyword(kw)} className="text-rose-600 hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {keywords.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                  No keywords yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
