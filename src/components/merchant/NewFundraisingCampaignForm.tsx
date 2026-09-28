"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import CampaignPagePreview from "@/components/campaigns/CampaignPagePreview";

export default function NewFundraisingCampaignForm({
  churchName,
  churchLogoUrl,
}: {
  churchName: string;
  churchLogoUrl?: string | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Campaign name is required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/merchant/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          goalAmountCents: goalAmount ? Math.round(parseFloat(goalAmount) * 100) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Failed to create campaign");
        return;
      }
      toast.success("Campaign created");
      router.push(`/merchant/campaigns/${data.campaign.id}`);
    } catch {
      toast.error("Failed to create campaign");
    } finally {
      setSubmitting(false);
    }
  };

  const goalAmountCents = goalAmount ? Math.round(parseFloat(goalAmount) * 100) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
      <form onSubmit={onSubmit} className="space-y-5 bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Spring Gala 2026"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Fundraising Goal (USD)</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={goalAmount}
            onChange={(e) => setGoalAmount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="250000"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-slate-400">
          Campaigns start as a draft. You&apos;ll be able to add teams and fundraisers, then set the campaign to Active when you&apos;re ready to publish it.
        </p>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitting ? "Creating..." : "Create Campaign"}
        </button>
      </form>

      <div className="lg:sticky lg:top-6">
        <h4 className="text-sm font-bold text-slate-900 mb-1">Live Preview</h4>
        <p className="text-xs text-slate-400 mb-3">
          This shows what your campaign&apos;s public page will look like. Nothing here is saved or public until you click Create Campaign.
        </p>
        <CampaignPagePreview
          churchName={churchName}
          churchLogoUrl={churchLogoUrl}
          name={name}
          description={description.trim() || undefined}
          goalAmountCents={goalAmountCents}
          endDate={endDate || undefined}
        />
      </div>
    </div>
  );
}
