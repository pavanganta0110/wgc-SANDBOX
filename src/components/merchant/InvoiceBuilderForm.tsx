"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { Plus, Trash2, X } from "lucide-react";
import ClientPicker from "@/components/merchant/ClientPicker";
import ClientForm from "@/components/merchant/ClientForm";
import { calculateLineItem, calculateInvoiceTotals } from "@/lib/invoices/invoiceMoney";
import { formatCents } from "@/lib/format";
import { EMPTY_LINE_ITEM, type LineItemForm, type InvoiceFormValues } from "@/lib/invoices/invoiceFormDefaults";

export type { InvoiceFormValues } from "@/lib/invoices/invoiceFormDefaults";

export default function InvoiceBuilderForm({ mode, initial }: { mode: "create" | "edit"; initial: InvoiceFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<InvoiceFormValues>(initial);
  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function updateLineItem(index: number, patch: Partial<LineItemForm>) {
    setValues((v) => ({ ...v, lineItems: v.lineItems.map((li, i) => (i === index ? { ...li, ...patch } : li)) }));
  }
  function addLineItem() {
    setValues((v) => ({ ...v, lineItems: [...v.lineItems, { ...EMPTY_LINE_ITEM }] }));
  }
  function removeLineItem(index: number) {
    setValues((v) => ({ ...v, lineItems: v.lineItems.filter((_, i) => i !== index) }));
  }

  const calculatedLineItems = useMemo(
    () =>
      values.lineItems.map((li) => {
        try {
          return calculateLineItem({ quantity: li.quantity, unitPriceCents: li.unitPriceCents, discountType: li.discountType, discountValue: li.discountValue, taxRateBasisPoints: li.taxRateBasisPoints });
        } catch {
          return { grossCents: 0, discountAppliedCents: 0, taxAmountCents: 0, totalCents: 0 };
        }
      }),
    [values.lineItems]
  );
  const totals = useMemo(
    () => calculateInvoiceTotals({ lineItems: calculatedLineItems, invoiceLevelDiscountCents: values.discountCents, serviceFeeCents: values.serviceFeeCents }),
    [calculatedLineItems, values.discountCents, values.serviceFeeCents]
  );

  async function handleSave(): Promise<string | null> {
    if (!values.client) {
      toast.error("Select a client first.");
      return null;
    }
    setSaving(true);
    try {
      const body = {
        clientId: values.client.id,
        title: values.title,
        poReference: values.poReference,
        issueDate: values.issueDate,
        dueDate: values.dueDate,
        internalNotes: values.internalNotes,
        clientMemo: values.clientMemo,
        paymentInstructions: values.paymentInstructions,
        termsAndConditions: values.termsAndConditions,
        lineItems: values.lineItems,
        discountCents: values.discountCents,
        serviceFeeCents: values.serviceFeeCents,
        allowCard: values.allowCard,
        allowAch: values.allowAch,
        allowApplePay: values.allowApplePay,
        allowGooglePay: values.allowGooglePay,
        allowPartialPayments: values.allowPartialPayments,
        minimumPartialPaymentCents: values.minimumPartialPaymentCents,
        allowFeeCoverage: values.allowFeeCoverage,
        feeCoveredBy: values.feeCoveredBy,
        autoCloseWhenPaid: values.autoCloseWhenPaid,
        templateName: values.templateName,
        accentColor: values.accentColor,
        classification: values.classification,
        goodsServicesValueCents: values.goodsServicesValueCents,
        charitablePortionCents: values.charitablePortionCents,
        noGoodsOrServicesConfirmed: values.noGoodsOrServicesConfirmed,
      };
      const url = mode === "create" ? "/api/merchant/invoices/create" : `/api/merchant/invoices/${values.id}/update`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!data.success) {
        toast.error(data.error || "Could not save invoice.");
        return null;
      }
      toast.success(mode === "create" ? "Invoice created." : "Invoice saved.");
      return data.invoice.id as string;
    } catch {
      toast.error("Could not reach the server.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const id = await handleSave();
    if (id) {
      router.push(`/merchant/invoices/${id}`);
      router.refresh();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,320px] gap-6">
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Client</h4>
          <ClientPicker selected={values.client} onSelect={(c) => set("client", c.id ? c : null)} />
          {!values.client && (
            <button type="button" onClick={() => setShowNewClientModal(true)} className="text-xs font-semibold text-blue-600 hover:underline">
              + Create a new client
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Invoice details</h4>
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Title (optional)" value={values.title} onChange={(e) => set("title", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="PO / reference number" value={values.poReference} onChange={(e) => set("poReference", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Issue date</label>
              <input type="date" value={values.issueDate} onChange={(e) => set("issueDate", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Due date</label>
              <input type="date" value={values.dueDate} onChange={(e) => set("dueDate", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
          <h4 className="text-sm font-bold text-slate-900">Line items</h4>
          {values.lineItems.map((li, i) => (
            <div key={i} className="p-3 rounded-xl border border-slate-100 space-y-2">
              <div className="flex items-start gap-2">
                <input placeholder="Description" value={li.description} onChange={(e) => updateLineItem(i, { description: e.target.value })} className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
                {values.lineItems.length > 1 && (
                  <button type="button" onClick={() => removeLineItem(i)} className="p-2 text-slate-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-500">Qty</label>
                  <input type="number" min={0} value={li.quantity} onChange={(e) => updateLineItem(i, { quantity: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Unit price ($)</label>
                  <input type="number" min={0} step={0.01} value={li.unitPriceCents / 100} onChange={(e) => updateLineItem(i, { unitPriceCents: Math.round(Number(e.target.value) * 100) })} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Discount</label>
                  <div className="flex gap-1">
                    <input type="number" min={0} value={li.discountValue} onChange={(e) => updateLineItem(i, { discountValue: Number(e.target.value) })} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
                    <select value={li.discountType} onChange={(e) => updateLineItem(i, { discountType: e.target.value as "FIXED" | "PERCENTAGE" })} className="px-1 py-1.5 rounded-lg border border-slate-200 text-xs">
                      <option value="FIXED">$</option>
                      <option value="PERCENTAGE">%</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500">Tax (bps)</label>
                  <input type="number" min={0} value={li.taxRateBasisPoints ?? ""} onChange={(e) => updateLineItem(i, { taxRateBasisPoints: e.target.value ? Number(e.target.value) : null })} className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-sm" />
                </div>
              </div>
              <div className="text-right text-xs text-slate-500">Line total: {formatCents(calculatedLineItems[i]?.totalCents ?? 0)}</div>
            </div>
          ))}
          <button type="button" onClick={addLineItem} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline">
            <Plus className="w-3.5 h-3.5" /> Add line item
          </button>

          <div className="pt-3 border-t border-slate-50 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice-level discount ($)</label>
              <input type="number" min={0} step={0.01} value={values.discountCents / 100} onChange={(e) => set("discountCents", Math.round(Number(e.target.value) * 100))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Service fee ($)</label>
              <input type="number" min={0} step={0.01} value={values.serviceFeeCents / 100} onChange={(e) => set("serviceFeeCents", Math.round(Number(e.target.value) * 100))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
          </div>
          <p className="text-xs text-slate-400">WGC does not determine your organization&apos;s tax obligations — enter tax rates according to your own guidance.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Payment classification</h4>
          <select value={values.classification} onChange={(e) => set("classification", e.target.value as InvoiceFormValues["classification"])} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
            <option value="GOODS_OR_SERVICES">Goods or Services (not a charitable donation)</option>
            <option value="CHARITABLE_DONATION">Charitable Donation</option>
            <option value="PARTIAL_DONATION">Partial Donation (goods/services + a charitable portion)</option>
          </select>

          {values.classification === "GOODS_OR_SERVICES" && (
            <p className="text-xs text-slate-500">This payment will not be added to charitable donation totals or year-end giving statements.</p>
          )}

          {values.classification === "CHARITABLE_DONATION" && (
            <label className="flex items-start gap-2 text-xs text-slate-700">
              <input type="checkbox" checked={values.noGoodsOrServicesConfirmed} onChange={(e) => set("noGoodsOrServicesConfirmed", e.target.checked)} className="mt-0.5" />
              I confirm no goods or services were provided to the client in exchange for this donation.
            </label>
          )}

          {values.classification === "PARTIAL_DONATION" && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Goods/services value ($)</label>
                <input type="number" min={0} step={0.01} value={(values.goodsServicesValueCents ?? 0) / 100} onChange={(e) => set("goodsServicesValueCents", Math.round(Number(e.target.value) * 100))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Charitable portion ($)</label>
                <input type="number" min={0} step={0.01} value={(values.charitablePortionCents ?? 0) / 100} onChange={(e) => set("charitablePortionCents", Math.round(Number(e.target.value) * 100))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              </div>
              <p className="col-span-2 text-xs text-slate-400">These two amounts must add up to the invoice total. Only the charitable portion flows into contribution reporting. This is not legal or tax advice.</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Payment settings</h4>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.allowCard} onChange={(e) => set("allowCard", e.target.checked)} /> Card</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.allowAch} onChange={(e) => set("allowAch", e.target.checked)} /> ACH</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.allowApplePay} onChange={(e) => set("allowApplePay", e.target.checked)} /> Apple Pay</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.allowGooglePay} onChange={(e) => set("allowGooglePay", e.target.checked)} /> Google Pay</label>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={values.allowPartialPayments} onChange={(e) => set("allowPartialPayments", e.target.checked)} /> Allow partial payments
          </label>
          {values.allowPartialPayments && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Minimum partial payment ($, optional)</label>
              <input type="number" min={0} step={0.01} value={(values.minimumPartialPaymentCents ?? 0) / 100} onChange={(e) => set("minimumPartialPaymentCents", Math.round(Number(e.target.value) * 100))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm max-w-[200px]" />
            </div>
          )}
          <div>
            <label className="flex items-center gap-2 text-sm text-slate-700 mb-2">
              <input type="checkbox" checked={values.allowFeeCoverage} onChange={(e) => set("allowFeeCoverage", e.target.checked)} /> Allow the client to cover processing fees
            </label>
            {values.allowFeeCoverage ? (
              <>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Default selection</label>
                <div className="flex gap-2">
                  {(["MERCHANT", "CLIENT"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => set("feeCoveredBy", v)} className={`px-3 py-1.5 rounded-full border text-xs font-medium ${values.feeCoveredBy === v ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600"}`}>
                      {v === "MERCHANT" ? "Off by default" : "On by default"}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">The client sees a checkbox on the payment page and can change this before paying — the fee is always shown clearly and included in the final amount before authorization.</p>
              </>
            ) : (
              <p className="text-xs text-slate-400">No fee-coverage option will be shown — you cover the processing fee on every payment.</p>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={values.autoCloseWhenPaid} onChange={(e) => set("autoCloseWhenPaid", e.target.checked)} /> Automatically close when fully paid
          </label>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-3">
          <h4 className="text-sm font-bold text-slate-900">Client-facing details</h4>
          <textarea placeholder="Memo (visible to client)" value={values.clientMemo} onChange={(e) => set("clientMemo", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <textarea placeholder="Payment instructions" value={values.paymentInstructions} onChange={(e) => set("paymentInstructions", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <textarea placeholder="Terms and conditions" value={values.termsAndConditions} onChange={(e) => set("termsAndConditions", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <textarea placeholder="Internal notes (not visible to client)" value={values.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-amber-50" />
        </div>
      </div>

      <div className="lg:sticky lg:top-6 h-fit space-y-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{formatCents(totals.subtotalCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Discount</span><span>-{formatCents(totals.discountCents)}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tax</span><span>{formatCents(totals.taxCents)}</span></div>
          {totals.serviceFeeCents > 0 && <div className="flex justify-between"><span className="text-slate-500">Service fee</span><span>{formatCents(totals.serviceFeeCents)}</span></div>}
          <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-100"><span>Total</span><span>{formatCents(totals.totalCents)}</span></div>
        </div>
        <button onClick={handleSaveDraft} disabled={saving} className="w-full px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? "Saving…" : "Save Draft"}
        </button>
      </div>

      {showNewClientModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 relative">
            <button onClick={() => setShowNewClientModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-sm font-bold text-slate-900 mb-4">New Client</h3>
            <ClientForm
              mode="create"
              onSaved={(client) => {
                set("client", { id: client.id, displayName: client.displayName, email: null, phone: null, organizationName: null, clientType: "INDIVIDUAL" });
                setShowNewClientModal(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
