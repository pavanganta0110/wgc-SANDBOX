"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { EXTERNAL_DONATION_STATUSES, CHECK_DEPOSIT_STATUSES } from "@/lib/donations/externalDonationTypes";

interface Donation {
  id: string;
  status: string;
  depositStatus: string | null;
  paymentMethod: string;
  donationAmountCents: number;
  donationDate: string;
  fundName: string | null;
  campaign: string | null;
  donationPurpose: string | null;
  externalTransactionId: string | null;
  confirmationNumber: string | null;
  providerFeeCents: number | null;
  netAmountReceivedCents: number | null;
  internalNote: string | null;
  includeInAnnualStatement: boolean;
  proofOfPaymentFileName: string | null;
  possibleDuplicate: boolean;
}

export default function ExternalDonationDetailPanel({
  donation,
  canEdit,
  canVoid,
  canViewProof,
}: {
  donation: Donation;
  canEdit: boolean;
  canVoid: boolean;
  canViewProof: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [fundName, setFundName] = useState(donation.fundName || "");
  const [campaign, setCampaign] = useState(donation.campaign || "");
  const [donationPurpose, setDonationPurpose] = useState(donation.donationPurpose || "");
  const [internalNote, setInternalNote] = useState(donation.internalNote || "");
  const [providerFee, setProviderFee] = useState(donation.providerFeeCents ? (donation.providerFeeCents / 100).toFixed(2) : "");
  const [includeInAnnualStatement, setIncludeInAnnualStatement] = useState(donation.includeInAnnualStatement);

  const isCheck = donation.paymentMethod === "CHECK";
  const statusOptions = isCheck ? CHECK_DEPOSIT_STATUSES : EXTERNAL_DONATION_STATUSES;
  const currentStatus = isCheck ? donation.depositStatus || "RECEIVED" : donation.status;

  async function saveEdits() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${donation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundName: fundName || null,
          campaign: campaign || null,
          donationPurpose: donationPurpose || null,
          internalNote: internalNote || null,
          providerFeeCents: providerFee ? Math.round(parseFloat(providerFee) * 100) : null,
          includeInAnnualStatement,
        }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not save changes");
      toast.success("Saved");
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(newStatus: string) {
    setBusy(true);
    try {
      const field = isCheck ? "depositStatus" : "status";
      const res = await fetch(`/api/merchant/donations/external/${donation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newStatus }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not update status");
      toast.success("Status updated");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleVoid() {
    if (!confirm("Void this donation? It will be excluded from totals and statements.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${donation.id}/void`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not void this donation");
      toast.success("Donation voided");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleProofUpload(file: File) {
    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/merchant/donations/external/${donation.id}/proof`, { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not upload attachment");
      toast.success("Attachment uploaded");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function viewProof() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donations/external/${donation.id}/proof`);
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not open attachment");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {donation.possibleDuplicate && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          This donation looked like a possible duplicate of another one when it was recorded. Double-check before including it in totals.
        </div>
      )}

      <section className="rounded-xl border border-slate-100 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Status</h2>
          {donation.status !== "VOIDED" ? (
            <select
              value={currentStatus}
              onChange={(e) => changeStatus(e.target.value)}
              disabled={busy || !canEdit}
              className="rounded-lg border border-slate-200 px-2 py-1 text-xs"
            >
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">VOIDED</span>
          )}
        </div>
        {canVoid && donation.status !== "VOIDED" && (
          <button onClick={handleVoid} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline">
            Void this donation
          </button>
        )}
      </section>

      <section className="rounded-xl border border-slate-100 bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Details</h2>
          {canEdit && donation.status !== "VOIDED" && (
            <button onClick={() => setEditing((v) => !v)} className="text-xs font-semibold text-blue-600 hover:underline">
              {editing ? "Cancel" : "Edit"}
            </button>
          )}
        </div>

        {!editing ? (
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs text-slate-400">Fund</dt>
              <dd className="text-slate-900">{donation.fundName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Campaign</dt>
              <dd className="text-slate-900">{donation.campaign || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Purpose</dt>
              <dd className="text-slate-900">{donation.donationPurpose || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Provider fee</dt>
              <dd className="text-slate-900">{donation.providerFeeCents ? `$${(donation.providerFeeCents / 100).toFixed(2)}` : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">External transaction ID</dt>
              <dd className="text-slate-900">{donation.externalTransactionId || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Confirmation number</dt>
              <dd className="text-slate-900">{donation.confirmationNumber || "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-slate-400">Internal note</dt>
              <dd className="text-slate-900 whitespace-pre-wrap">{donation.internalNote || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">Include in annual statement</dt>
              <dd className="text-slate-900">{donation.includeInAnnualStatement ? "Yes" : "No"}</dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <input placeholder="Fund" value={fundName} onChange={(e) => setFundName(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              <input placeholder="Campaign" value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <input placeholder="Donation purpose" value={donationPurpose} onChange={(e) => setDonationPurpose(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="Provider fee" type="number" step="0.01" value={providerFee} onChange={(e) => setProviderFee(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <textarea placeholder="Internal note" value={internalNote} onChange={(e) => setInternalNote(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows={2} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeInAnnualStatement} onChange={(e) => setIncludeInAnnualStatement(e.target.checked)} />
              Include in annual statement
            </label>
            <button onClick={saveEdits} disabled={busy} className="rounded-lg bg-[#010409] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              Save
            </button>
          </div>
        )}
      </section>

      {canViewProof && (
        <section className="rounded-xl border border-slate-100 bg-white p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">Proof of payment</h2>
          <p className="text-xs text-slate-400">Private — never shown on the donor receipt.</p>
          {donation.proofOfPaymentFileName ? (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-slate-700">{donation.proofOfPaymentFileName}</span>
              <button onClick={viewProof} disabled={busy} className="text-xs font-semibold text-blue-600 hover:underline">
                View
              </button>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No attachment</p>
          )}
          {canEdit && (
            <input
              type="file"
              accept="image/jpeg,image/png,image/heic,image/webp,application/pdf"
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && handleProofUpload(e.target.files[0])}
              className="text-xs"
            />
          )}
        </section>
      )}
    </div>
  );
}
