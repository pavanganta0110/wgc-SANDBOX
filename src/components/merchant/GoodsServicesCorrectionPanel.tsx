"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { formatCents } from "@/lib/format";
import { validateGoodsServicesInput, computeRecordedContributionAmountCents } from "@/lib/giving/goodsServices";

interface Props {
  transferId: string;
  paymentAmountCents: number;
  receiptAlreadySent: boolean;
  initial: {
    goodsServicesProvided: boolean;
    goodsServicesDescription: string | null;
    goodsServicesFairMarketValueCents: number | null;
    goodsServicesInternalNote: string | null;
  };
}

export default function GoodsServicesCorrectionPanel({ transferId, paymentAmountCents, receiptAlreadySent, initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [provided, setProvided] = useState(initial.goodsServicesProvided);
  const [description, setDescription] = useState(initial.goodsServicesDescription || "");
  const [fmv, setFmv] = useState(initial.goodsServicesFairMarketValueCents != null ? (initial.goodsServicesFairMarketValueCents / 100).toFixed(2) : "");
  const [internalNote, setInternalNote] = useState(initial.goodsServicesInternalNote || "");
  const [saving, setSaving] = useState(false);

  const fmvCents = fmv.trim() ? Math.round((parseFloat(fmv) || 0) * 100) : null;
  const validation = validateGoodsServicesInput({ provided, description, fairMarketValueCents: fmvCents }, paymentAmountCents);
  const recordedContributionAmountCents = provided ? computeRecordedContributionAmountCents(paymentAmountCents, fmvCents ?? 0) : paymentAmountCents;

  const save = async (resend: boolean) => {
    if (!validation.valid) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/merchant/transactions/payments/${transferId}/goods-services`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodsServicesProvided: provided,
          goodsServicesDescription: provided ? description.trim() : undefined,
          goodsServicesFairMarketValueCents: provided ? fmvCents : undefined,
          goodsServicesInternalNote: internalNote.trim() || undefined,
          resend,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save correction");
      if (data.requiresResendConfirmation) {
        toast.success("Correction saved. A receipt was already sent — confirm below to resend a corrected version.");
      } else if (resend) {
        toast.success("Correction saved and a corrected receipt was sent to the donor.");
      } else {
        toast.success("Correction saved.");
      }
      setEditing(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save correction");
    } finally {
      setSaving(false);
    }
  };

  const onSaveClick = () => {
    if (!validation.valid) return;
    if (receiptAlreadySent) {
      if (window.confirm("A receipt for this payment was already sent to the donor. Save this correction and send a corrected receipt now?")) {
        save(true);
      } else {
        save(false);
      }
    } else {
      save(false);
    }
  };

  if (!editing) {
    return (
      <div className="text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status</span>
          <span className="font-semibold text-slate-800">{initial.goodsServicesProvided ? "Goods or Services Provided" : "None Provided"}</span>
        </div>
        {initial.goodsServicesProvided && (
          <>
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-500">Description</span>
              <span className="font-semibold text-slate-800 text-right max-w-[60%]">{initial.goodsServicesDescription}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-slate-500">Fair Market Value</span>
              <span className="font-semibold text-slate-800">{formatCents(initial.goodsServicesFairMarketValueCents ?? 0)}</span>
            </div>
          </>
        )}
        <button onClick={() => setEditing(true)} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
          Correct
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={`gs-${transferId}`} checked={!provided} onChange={() => setProvided(false)} />
          No goods or services were provided
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="radio" name={`gs-${transferId}`} checked={provided} onChange={() => setProvided(true)} />
          Goods or services were provided
        </label>
      </div>
      {provided && (
        <div className="space-y-2">
          <div>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description of goods or services"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {validation.errors.description && <p className="text-xs text-red-600 mt-1">{validation.errors.description}</p>}
          </div>
          <div>
            <input
              type="number"
              step="0.01"
              min="0"
              value={fmv}
              onChange={(e) => setFmv(e.target.value)}
              placeholder="Estimated fair market value ($)"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            />
            {validation.errors.fairMarketValueCents && <p className="text-xs text-red-600 mt-1">{validation.errors.fairMarketValueCents}</p>}
          </div>
          <input
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            placeholder="Internal note (optional, not shown to donor)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-slate-500">Recorded Contribution Amount: {formatCents(recordedContributionAmountCents)}</p>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600">
          Cancel
        </button>
        <button
          onClick={onSaveClick}
          disabled={!validation.valid || saving}
          className="px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Correction"}
        </button>
      </div>
    </div>
  );
}
