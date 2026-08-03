"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { canVoid, canMarkUncollectible, canSend, type InvoiceStatus } from "@/lib/invoices/invoiceStatus";

export default function InvoiceDetailActions({
  invoiceId,
  status,
  canVoid: hasVoidPermission,
  canDuplicate,
  canSend: hasSendPermission,
}: {
  invoiceId: string;
  status: string;
  canVoid: boolean;
  canDuplicate: boolean;
  canSend: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmingVoid, setConfirmingVoid] = useState(false);

  async function post(path: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/invoices/${invoiceId}/${path}`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Done.");
        router.refresh();
      } else {
        toast.error(data.error || "Could not complete this action.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
      setConfirmingVoid(false);
    }
  }

  async function handleDuplicate() {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/invoices/${invoiceId}/duplicate`, { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success("Invoice duplicated.");
        router.push(`/merchant/invoices/${data.invoice.id}/edit`);
      } else {
        toast.error(data.error || "Could not duplicate this invoice.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const resendableStatuses: InvoiceStatus[] = ["SENT", "VIEWED", "PARTIALLY_PAID", "PAST_DUE"];
  const showSend = hasSendPermission && canSend(status as InvoiceStatus);
  const showResend = hasSendPermission && resendableStatuses.includes(status as InvoiceStatus);

  return (
    <div className="flex items-center gap-2">
      {(showSend || showResend) && (
        <button onClick={() => post("send")} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
          {showSend ? "Send Invoice" : "Resend"}
        </button>
      )}
      <a href={`/api/merchant/invoices/${invoiceId}/pdf`} target="_blank" rel="noreferrer" className="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50">
        Download PDF
      </a>
      {canDuplicate && (
        <button onClick={handleDuplicate} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Duplicate
        </button>
      )}
      {hasVoidPermission && canMarkUncollectible(status as InvoiceStatus) && (
        <button onClick={() => post("mark-uncollectible")} disabled={busy} className="px-3 py-2 rounded-xl text-sm font-semibold border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Mark Uncollectible
        </button>
      )}
      {hasVoidPermission && canVoid(status as InvoiceStatus) && !confirmingVoid && (
        <button onClick={() => setConfirmingVoid(true)} className="px-3 py-2 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50">
          Void
        </button>
      )}
      {confirmingVoid && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">Void this invoice? Its payment link will stop working.</span>
          <button onClick={() => post("void")} disabled={busy} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
            Confirm Void
          </button>
          <button onClick={() => setConfirmingVoid(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-50">
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
