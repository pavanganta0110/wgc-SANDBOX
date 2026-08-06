"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";

interface InvoiceSettingsValues {
  invoiceNumberPrefix: string;
  nextInvoiceSequence: number;
  defaultDueDays: number;
  defaultMemo: string;
  defaultTerms: string;
  defaultPaymentInstructions: string;
  defaultAllowCard: boolean;
  defaultAllowAch: boolean;
  defaultAllowApplePay: boolean;
  defaultAllowGooglePay: boolean;
  defaultAllowPartialPayments: boolean;
  defaultFeeCoveredBy: string;
  remindersEnabledByDefault: boolean;
  reminderBeforeDueDays: number;
  reminderOnDueDate: boolean;
  reminderAfterDueDays: number[];
  defaultTemplateName: string;
  accentColor: string;
  invoiceLogoUrl: string | null;
  organizationDisplayName: string;
  organizationLegalName: string;
  organizationAddress: string;
  organizationPhone: string;
  organizationSupportEmail: string;
  organizationWebsite: string;
  taxRegistrationNumber: string;
  footerMessage: string;
  thankYouMessage: string;
  replyToEmail: string;
  showWgcBranding: boolean;
  defaultClassification: string;
}

const TEMPLATES = ["CLASSIC", "MODERN", "MINIMAL", "PROFESSIONAL"];

export default function InvoiceSettingsForm({
  initial,
  fallbackOrgName,
  fallbackLogoUrl,
}: {
  initial: Record<string, unknown>;
  fallbackOrgName: string;
  fallbackLogoUrl: string | null;
}) {
  const [values, setValues] = useState<InvoiceSettingsValues>({
    invoiceNumberPrefix: String(initial.invoiceNumberPrefix ?? "INV-"),
    nextInvoiceSequence: Number(initial.nextInvoiceSequence ?? 1),
    defaultDueDays: Number(initial.defaultDueDays ?? 30),
    defaultMemo: String(initial.defaultMemo ?? ""),
    defaultTerms: String(initial.defaultTerms ?? ""),
    defaultPaymentInstructions: String(initial.defaultPaymentInstructions ?? ""),
    defaultAllowCard: initial.defaultAllowCard !== false,
    defaultAllowAch: initial.defaultAllowAch !== false,
    defaultAllowApplePay: initial.defaultAllowApplePay !== false,
    defaultAllowGooglePay: initial.defaultAllowGooglePay !== false,
    defaultAllowPartialPayments: Boolean(initial.defaultAllowPartialPayments),
    defaultFeeCoveredBy: String(initial.defaultFeeCoveredBy ?? "MERCHANT"),
    remindersEnabledByDefault: initial.remindersEnabledByDefault !== false,
    reminderBeforeDueDays: Number(initial.reminderBeforeDueDays ?? 3),
    reminderOnDueDate: initial.reminderOnDueDate !== false,
    reminderAfterDueDays: Array.isArray(initial.reminderAfterDueDaysJson) ? (initial.reminderAfterDueDaysJson as number[]) : [3, 7],
    defaultTemplateName: String(initial.defaultTemplateName ?? "CLASSIC"),
    accentColor: String(initial.accentColor ?? "#1d4ed8"),
    invoiceLogoUrl: (initial.invoiceLogoUrl as string | null) ?? null,
    organizationDisplayName: String(initial.organizationDisplayName ?? fallbackOrgName),
    organizationLegalName: String(initial.organizationLegalName ?? ""),
    organizationAddress: String(initial.organizationAddress ?? ""),
    organizationPhone: String(initial.organizationPhone ?? ""),
    organizationSupportEmail: String(initial.organizationSupportEmail ?? ""),
    organizationWebsite: String(initial.organizationWebsite ?? ""),
    taxRegistrationNumber: String(initial.taxRegistrationNumber ?? ""),
    footerMessage: String(initial.footerMessage ?? ""),
    thankYouMessage: String(initial.thankYouMessage ?? ""),
    replyToEmail: String(initial.replyToEmail ?? ""),
    showWgcBranding: initial.showWgcBranding !== false,
    defaultClassification: String(initial.defaultClassification ?? "GOODS_OR_SERVICES"),
  });
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  function set<K extends keyof InvoiceSettingsValues>(key: K, value: InvoiceSettingsValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/merchant/settings/invoicing/logo-upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.success) {
        set("invoiceLogoUrl", data.logoUrl);
        toast.success("Logo uploaded.");
      } else {
        toast.error(data.error || "Could not upload logo.");
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setUploadingLogo(false);
    }
  }

  async function handleLogoRemove() {
    try {
      const res = await fetch("/api/merchant/settings/invoicing/logo-remove", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        set("invoiceLogoUrl", null);
        toast.success("Logo removed — invoices will show your organization name instead.");
      }
    } catch {
      toast.error("Could not reach the server.");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/settings/invoicing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (data.success) toast.success("Invoice settings saved.");
      else toast.error(data.error || "Could not save settings.");
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  const previewLogoUrl = values.invoiceLogoUrl || fallbackLogoUrl;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr,360px] gap-6">
      <div className="space-y-6">
        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Logo</h4>
          <div className="flex items-center gap-4">
            {previewLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewLogoUrl} alt="Invoice logo" className="h-14 w-auto max-w-[160px] object-contain rounded-lg border border-slate-100" />
            ) : (
              <div className="h-14 w-32 flex items-center justify-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-400">No logo</div>
            )}
            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {uploadingLogo ? "Uploading…" : "Upload logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
            </label>
            {values.invoiceLogoUrl && (
              <button onClick={handleLogoRemove} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">PNG, JPG, or WEBP. Max 5MB. Falls back to your organization name if not set.</p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Organization details</h4>
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Display name" value={values.organizationDisplayName} onChange={(e) => set("organizationDisplayName", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Legal name (optional)" value={values.organizationLegalName} onChange={(e) => set("organizationLegalName", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Phone" value={values.organizationPhone} onChange={(e) => set("organizationPhone", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Support email" value={values.organizationSupportEmail} onChange={(e) => set("organizationSupportEmail", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Website" value={values.organizationWebsite} onChange={(e) => set("organizationWebsite", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="Tax ID / registration number" value={values.taxRegistrationNumber} onChange={(e) => set("taxRegistrationNumber", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <textarea placeholder="Address" value={values.organizationAddress} onChange={(e) => set("organizationAddress", e.target.value)} rows={2} className="w-full mt-4 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Appearance</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default template</label>
              <select value={values.defaultTemplateName} onChange={(e) => set("defaultTemplateName", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                {TEMPLATES.map((t) => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Accent color</label>
              <input type="color" value={values.accentColor} onChange={(e) => set("accentColor", e.target.value)} className="w-full h-9 rounded-lg border border-slate-200" />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-slate-700">
            <input type="checkbox" checked={values.showWgcBranding} onChange={(e) => set("showWgcBranding", e.target.checked)} />
            Show WGC branding in the footer
          </label>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Numbering</h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Prefix</label>
              <input value={values.invoiceNumberPrefix} onChange={(e) => set("invoiceNumberPrefix", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-mono" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Next sequence number</label>
              <input type="number" min={1} value={values.nextInvoiceSequence} onChange={(e) => set("nextInvoiceSequence", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
              <p className="text-xs text-slate-400 mt-1">Can only be moved forward, never backward.</p>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Defaults</h4>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default due terms (days)</label>
              <input type="number" min={0} value={values.defaultDueDays} onChange={(e) => set("defaultDueDays", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default classification</label>
              <select value={values.defaultClassification} onChange={(e) => set("defaultClassification", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm">
                <option value="GOODS_OR_SERVICES">Goods or Services</option>
                <option value="CHARITABLE_DONATION">Charitable Donation</option>
                <option value="PARTIAL_DONATION">Partial Donation</option>
              </select>
            </div>
          </div>
          <textarea placeholder="Default memo shown to clients" value={values.defaultMemo} onChange={(e) => set("defaultMemo", e.target.value)} rows={2} className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <textarea placeholder="Default terms & conditions" value={values.defaultTerms} onChange={(e) => set("defaultTerms", e.target.value)} rows={2} className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <textarea placeholder="Default payment instructions" value={values.defaultPaymentInstructions} onChange={(e) => set("defaultPaymentInstructions", e.target.value)} rows={2} className="w-full mb-3 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.defaultAllowCard} onChange={(e) => set("defaultAllowCard", e.target.checked)} /> Card</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.defaultAllowAch} onChange={(e) => set("defaultAllowAch", e.target.checked)} /> ACH</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.defaultAllowApplePay} onChange={(e) => set("defaultAllowApplePay", e.target.checked)} /> Apple Pay</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.defaultAllowGooglePay} onChange={(e) => set("defaultAllowGooglePay", e.target.checked)} /> Google Pay</label>
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={values.defaultAllowPartialPayments} onChange={(e) => set("defaultAllowPartialPayments", e.target.checked)} /> Allow partial payments</label>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-3">Reminders</h4>
          <label className="flex items-center gap-2 mb-3 text-sm text-slate-700">
            <input type="checkbox" checked={values.remindersEnabledByDefault} onChange={(e) => set("remindersEnabledByDefault", e.target.checked)} />
            Enable reminders by default on new invoices
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Days before due date</label>
              <input type="number" min={0} value={values.reminderBeforeDueDays} onChange={(e) => set("reminderBeforeDueDays", Number(e.target.value))} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Days after due date (comma-separated)</label>
              <input
                value={values.reminderAfterDueDays.join(", ")}
                onChange={(e) => set("reminderAfterDueDays", e.target.value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)))}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-slate-700">
            <input type="checkbox" checked={values.reminderOnDueDate} onChange={(e) => set("reminderOnDueDate", e.target.checked)} />
            Send a reminder on the due date
          </label>
        </div>

        <button onClick={handleSave} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50">
          {saving ? "Saving…" : "Save Invoice Settings"}
        </button>
      </div>

      {/* Live preview — sample data clearly labeled, uses the same field
          values a real invoice would render with. */}
      <div className="lg:sticky lg:top-6 h-fit">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Preview (sample data)</p>
        <div className="rounded-2xl border border-slate-200 shadow-sm overflow-hidden bg-white">
          <div className="p-5 border-b" style={{ borderColor: values.accentColor }}>
            <div className="flex items-center justify-between">
              {previewLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewLogoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
              ) : (
                <div className="text-sm font-bold text-slate-900">{values.organizationDisplayName}</div>
              )}
              <div className="text-right">
                <div className="text-xs text-slate-400">Invoice</div>
                <div className="text-sm font-mono font-semibold" style={{ color: values.accentColor }}>{values.invoiceNumberPrefix}{String(values.nextInvoiceSequence).padStart(6, "0")}</div>
              </div>
            </div>
          </div>
          <div className="p-5 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-900">Sample Client</p>
            <div className="flex justify-between"><span>Consulting services</span><span>$100.00</span></div>
            <div className="flex justify-between font-semibold text-slate-900 pt-2 border-t border-slate-100"><span>Total</span><span>$100.00</span></div>
            {values.defaultMemo && <p className="text-slate-400 pt-2">{values.defaultMemo}</p>}
          </div>
          {values.footerMessage && <div className="px-5 pb-4 text-xs text-slate-400">{values.footerMessage}</div>}
          {values.showWgcBranding && <div className="px-5 py-2 bg-slate-50 text-[10px] text-slate-400 text-center">Powered by WGC Payments</div>}
        </div>
      </div>
    </div>
  );
}
