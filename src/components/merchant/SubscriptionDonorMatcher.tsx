"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Search } from "lucide-react";

interface DonorOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export default function SubscriptionDonorMatcher({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DonorOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const search = async (q: string) => {
    setQuery(q);
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/link-donor?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.donors ?? []);
    } finally {
      setSearching(false);
    }
  };

  const selectDonor = async (donor: DonorOption) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/subscriptions/${subscriptionId}/link-donor`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ donorId: donor.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error || "Failed to link donor");
        return;
      }
      toast.success(`Linked to ${donor.name}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1">
      <p className="text-xs font-semibold text-amber-600 mb-1.5">Needs donor matching</p>
      <div className="relative max-w-xs">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          placeholder="Search donors by name, email, phone"
          disabled={saving}
          className="w-full pl-8 pr-2 py-1.5 rounded-lg border border-slate-200 text-xs outline-none focus:ring-2 focus:ring-blue-500"
        />
        {query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            {searching ? (
              <p className="px-3 py-2 text-xs text-slate-400">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-slate-400">No matching donors</p>
            ) : (
              results.map((donor) => (
                <button
                  key={donor.id}
                  type="button"
                  onClick={() => selectDonor(donor)}
                  disabled={saving}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-50"
                >
                  <p className="font-semibold text-slate-800">{donor.name}</p>
                  <p className="text-slate-400">{donor.email || donor.phone || "—"}</p>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
