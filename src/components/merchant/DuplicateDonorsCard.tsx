"use client";

import { useEffect, useState } from "react";
import { formatPersonName } from "@/lib/formatPersonName";
import { formatDateTimeCDT } from "@/lib/formatDateTimeCDT";
import MergeDonorsModal from "@/components/merchant/MergeDonorsModal";

interface Candidate {
  donor: { id: string; name: string | null; email: string | null; phone: string | null; createdAt: string };
  matchedOn: string[];
}

export default function DuplicateDonorsCard({ donorId, canMerge }: { donorId: string; canMerge: boolean }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/merchant/donors/${donorId}/duplicates`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates ?? []))
      .catch(() => setCandidates([]));
  }, [donorId]);

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
                onClick={() => setMergeTargetId(c.donor.id)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Review &amp; Merge
              </button>
            )}
          </div>
        ))}
      </div>
      {mergeTargetId && (
        <MergeDonorsModal primaryDonorId={donorId} duplicateDonorId={mergeTargetId} onClose={() => setMergeTargetId(null)} />
      )}
    </div>
  );
}
