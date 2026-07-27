"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DonorPicker from "@/components/merchant/DonorPicker";

interface DonorHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface Props {
  id: string;
  status: string;
  donorMatchStatus: string;
  canVoid: boolean;
  canSendReceipt: boolean;
  canMatch: boolean;
  hasDonorEmail: boolean;
}

export default function ExternalDonationRowActions({ id, status, donorMatchStatus, canVoid, canSendReceipt, canMatch, hasDonorEmail }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [matching, setMatching] = useState(false);
  const [selectedDonor, setSelectedDonor] = useState<DonorHit | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  async function handleVoid() {
    if (!confirm("Void this donation? It will be excluded from totals and statements.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not void this donation");
      toast.success("Donation voided");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleSendReceipt() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${id}/receipt`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not send receipt");
      toast.success("Receipt sent");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleMatch(mode: "existing" | "new" | "anonymous" | "unmatch") {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${id}/match-donor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, donorId: selectedDonor?.id, donorName: name, donorEmail: email, donorPhone: phone }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not update donor");
      toast.success("Donor updated");
      setMatching(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        {canMatch && (donorMatchStatus === "UNMATCHED" || donorMatchStatus === "ANONYMOUS") && (
          <button onClick={() => setMatching((v) => !v)} disabled={busy} className="text-xs font-semibold text-blue-600 hover:underline">
            Connect donor
          </button>
        )}
        {canSendReceipt && hasDonorEmail && status !== "VOIDED" && (
          <button onClick={handleSendReceipt} disabled={busy} className="text-xs font-semibold text-slate-600 hover:underline">
            Send receipt
          </button>
        )}
        {canVoid && status !== "VOIDED" && (
          <button onClick={handleVoid} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline">
            Void
          </button>
        )}
      </div>
      {matching && (
        <div className="w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg space-y-2">
          <DonorPicker selected={selectedDonor} onSelect={setSelectedDonor} onClear={() => setSelectedDonor(null)} />
          {selectedDonor ? (
            <button onClick={() => handleMatch("existing")} disabled={busy} className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">
              Connect to {selectedDonor.name || "this donor"}
            </button>
          ) : (
            <>
              <p className="text-[11px] text-slate-400">Or add a new donor:</p>
              <input placeholder="Donor name" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
              <div className="flex flex-wrap gap-2 pt-1">
                <button onClick={() => handleMatch("new")} disabled={busy} className="rounded bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">
                  Save donor
                </button>
                <button onClick={() => handleMatch("anonymous")} disabled={busy} className="rounded border border-slate-200 px-2 py-1 text-[11px]">
                  Mark anonymous
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
