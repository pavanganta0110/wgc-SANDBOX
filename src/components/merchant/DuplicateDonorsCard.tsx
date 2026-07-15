"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";

interface Candidate {
  donor: { id: string; name: string | null; email: string | null; phone: string | null; createdAt: string };
  matchedOn: string[];
}

export default function DuplicateDonorsCard({ donorId, canMerge }: { donorId: string; canMerge: boolean }) {
  const router = useRouter();
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [merging, setMerging] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/merchant/donors/${donorId}/duplicates`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []))
      .catch(() => setCandidates([]));
  }, [donorId]);

  const merge = async (duplicateDonorId: string) => {
    if (!window.confirm("Merge this donor into the current profile? All donations, payment methods, and notes will be reassigned, and the duplicate will be archived. This cannot be undone.")) {
      return;
    }
    setMerging(duplicateDonorId);
    try {
      const res = await fetch(`/api/merchant/donors/${donorId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateDonorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to merge donors");
      toast.success("Donors merged");
      router.refresh();
      setCandidates((c) => c?.filter((x) => x.donor.id !== duplicateDonorId) ?? null);
    } catch (err: any) {
      toast.error(err.message || "Failed to merge donors");
    } finally {
      setMerging(null);
    }
  };

  if (candidates === null || candidates.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-amber-200 shadow-sm p-6">
      <h3 className="text-sm font-bold text-slate-900 mb-1">Possible Duplicate Donors</h3>
      <p className="text-xs text-slate-500 mb-3">Matched by email, phone, or external identity — not by name alone.</p>
      <div className="space-y-3">
        {candidates.map((c) => (
          <div key={c.donor.id} className="flex items-center justify-between border-t border-slate-50 pt-3 first:border-0 first:pt-0">
            <div>
              <p className="text-sm font-semibold text-slate-800">{formatPersonName(c.donor.name)}</p>
              <p className="text-xs text-slate-500">{c.donor.email || "—"} · {c.donor.phone || "—"}</p>
              <p className="text-xs text-slate-400">Matched on {c.matchedOn.join(", ")} · Since {formatDateTimeCDT(c.donor.createdAt)}</p>
            </div>
            {canMerge && (
              <button
                onClick={() => merge(c.donor.id)}
                disabled={merging === c.donor.id}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {merging === c.donor.id ? "Merging…" : "Merge Into This Donor"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
