"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { formatCents } from "@/lib/format";
import { formatPersonName } from "@/lib/formatPersonName";

interface DonorSide {
  donor: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    finixIdentityId: string | null;
  };
  aggregates: {
    totalDonatedCents: number;
    externalDonatedCents: number;
    donationCount: number;
    refundedAmountCents: number;
  };
  noteCount: number;
  activeSubscriptions: number;
  statementCount: number;
}

type FieldKey = "name" | "email" | "phone" | "addressLine1" | "city" | "state" | "postalCode";
const FIELDS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "addressLine1", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "Postal Code" },
];

export default function MergeDonorsModal({
  primaryDonorId,
  duplicateDonorId,
  onClose,
}: {
  primaryDonorId: string;
  duplicateDonorId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<{ primary: DonorSide; duplicate: DonorSide } | null>(null);
  const [selections, setSelections] = useState<Partial<Record<FieldKey, "primary" | "duplicate">>>({});
  const [merging, setMerging] = useState(false);

  useEffect(() => {
    fetch(`/api/merchant/donors/${primaryDonorId}/merge-preview?duplicateId=${duplicateDonorId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((err) => toast.error(err.message || "Failed to load comparison"));
  }, [primaryDonorId, duplicateDonorId]);

  const confirmMerge = async () => {
    setMerging(true);
    try {
      const res = await fetch(`/api/merchant/donors/${primaryDonorId}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duplicateDonorId, fieldSelections: selections }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Failed to merge donors");
      toast.success("Donors merged");
      onClose();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge donors");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Review before merging</h2>
        <p className="text-sm text-slate-500 mb-4">
          Every financial transaction, note, and receipt from the duplicate moves to this donor. The duplicate record is archived, never deleted — nothing here is reversible from this screen.
        </p>

        {!data ? (
          <p className="text-sm text-slate-400 py-8 text-center">Loading comparison…</p>
        ) : (
          <>
            <table className="w-full mb-4">
              <thead>
                <tr>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-2">Field</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-2">Keep existing (this donor)</th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase py-2">Use duplicate&apos;s value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FIELDS.map((f) => {
                  const primaryVal = data.primary.donor[f.key];
                  const duplicateVal = data.duplicate.donor[f.key];
                  if (!primaryVal && !duplicateVal) return null;
                  const differ = (primaryVal || "") !== (duplicateVal || "");
                  return (
                    <tr key={f.key} className={differ ? "bg-amber-50/40" : undefined}>
                      <td className="py-2 text-xs font-semibold text-slate-500">{f.label}</td>
                      <td className="py-2 text-sm">
                        <label className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={f.key}
                            checked={selections[f.key] !== "duplicate"}
                            onChange={() => setSelections((s) => ({ ...s, [f.key]: "primary" }))}
                          />
                          {primaryVal || <span className="text-slate-300">—</span>}
                        </label>
                      </td>
                      <td className="py-2 text-sm">
                        {duplicateVal && differ ? (
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name={f.key}
                              checked={selections[f.key] === "duplicate"}
                              onChange={() => setSelections((s) => ({ ...s, [f.key]: "duplicate" }))}
                            />
                            {duplicateVal}
                          </label>
                        ) : (
                          <span className="text-slate-300">{duplicateVal || "—"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="rounded-xl border border-slate-100 p-3">
                <p className="text-xs text-slate-400 uppercase mb-2">This donor (survives)</p>
                <p className="text-sm">Total: {formatCents(data.primary.aggregates.totalDonatedCents)}</p>
                <p className="text-sm">External: {formatCents(data.primary.aggregates.externalDonatedCents)}</p>
                <p className="text-sm">Donations: {data.primary.aggregates.donationCount}</p>
                <p className="text-sm">Active recurring: {data.primary.activeSubscriptions}</p>
                <p className="text-sm">Notes: {data.primary.noteCount}</p>
                <p className="text-sm">Statements: {data.primary.statementCount}</p>
              </div>
              <div className="rounded-xl border border-red-100 bg-red-50/30 p-3">
                <p className="text-xs text-slate-400 uppercase mb-2">Duplicate (archived, merged in)</p>
                <p className="text-sm">Total: {formatCents(data.duplicate.aggregates.totalDonatedCents)}</p>
                <p className="text-sm">External: {formatCents(data.duplicate.aggregates.externalDonatedCents)}</p>
                <p className="text-sm">Donations: {data.duplicate.aggregates.donationCount}</p>
                <p className="text-sm">Active recurring: {data.duplicate.activeSubscriptions}</p>
                <p className="text-sm">Notes: {data.duplicate.noteCount}</p>
                <p className="text-sm">Statements: {data.duplicate.statementCount}</p>
              </div>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              After merging: {formatPersonName(data.primary.donor.name)} will show a combined total of{" "}
              {formatCents(data.primary.aggregates.totalDonatedCents + data.duplicate.aggregates.totalDonatedCents)}.
            </p>
          </>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-slate-600 text-sm font-semibold hover:bg-slate-100">
            Cancel
          </button>
          <button
            onClick={confirmMerge}
            disabled={!data || merging}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {merging ? "Merging…" : "Merge donors"}
          </button>
        </div>
      </div>
    </div>
  );
}
