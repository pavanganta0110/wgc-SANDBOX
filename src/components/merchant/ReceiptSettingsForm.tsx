"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import SettingsSaveBar from "@/components/merchant/SettingsSaveBar";
import { useUnsavedChangesWarning } from "@/lib/settings/useUnsavedChanges";

interface FormValues {
  receiptAutoSend: boolean;
  receiptSenderName: string;
  receiptReplyToEmail: string;
  receiptSubjectTemplate: string;
  receiptHeader: string;
  receiptThankYouMessage: string;
  receiptFooter: string;
  receiptShowAddress: boolean;
  receiptShowPhone: boolean;
  receiptShowEmail: boolean;
  receiptShowFund: boolean;
  receiptShowDonorCoveredFee: boolean;
  receiptShowPaymentMethodLastFour: boolean;
  receiptShowRecurringSchedule: boolean;
  receiptShowDonationReference: boolean;
  receiptShowTaxId: boolean;
  receiptShowWebsite: boolean;
  receiptDisclaimer: string;
  receiptSendCopyToOrg: boolean;
  receiptSupportContact: string;
  receiptNumberPrefix: string;
  acknowledgmentNoGoodsServicesText: string;
  acknowledgmentGoodsServicesTemplate: string;
}

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between py-2 text-sm text-slate-700">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export default function ReceiptSettingsForm({ initial }: { initial: FormValues }) {
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState(0);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(isDirty);

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) => setValues((v) => ({ ...v, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/settings/receipts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Receipt settings saved");
      Object.assign(initial, values);
      setPreviewKey((k) => k + 1);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testEmail.trim()) {
      toast.error("Enter an email to send the test receipt to");
      return;
    }
    if (!window.confirm(`Send a test receipt to ${testEmail.trim()}?`)) return;
    setSendingTest(true);
    try {
      const res = await fetch("/api/merchant/settings/receipts/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send test receipt");
      toast.success(`Test receipt sent to ${testEmail.trim()}`);
    } catch (err: any) {
      toast.error(err.message || "Failed to send test receipt");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <Toggle label="Automatically Send Donation Receipt" checked={values.receiptAutoSend} onChange={(v) => set("receiptAutoSend", v)} />
        <div className="space-y-3 mt-3">
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Sender Name</label><input className={inputClass} value={values.receiptSenderName} onChange={(e) => set("receiptSenderName", e.target.value)} placeholder="Defaults to organization name" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Reply-To Email</label><input className={inputClass} value={values.receiptReplyToEmail} onChange={(e) => set("receiptReplyToEmail", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Subject Template</label><input className={inputClass} value={values.receiptSubjectTemplate} onChange={(e) => set("receiptSubjectTemplate", e.target.value)} placeholder="Thank you for your gift to [Organization Name]" /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Header</label><input className={inputClass} value={values.receiptHeader} onChange={(e) => set("receiptHeader", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Thank-You Message</label><textarea className={inputClass} rows={2} value={values.receiptThankYouMessage} onChange={(e) => set("receiptThankYouMessage", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Footer</label><textarea className={inputClass} rows={2} value={values.receiptFooter} onChange={(e) => set("receiptFooter", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Custom Disclaimer</label><textarea className={inputClass} rows={2} value={values.receiptDisclaimer} onChange={(e) => set("receiptDisclaimer", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Support Contact</label><input className={inputClass} value={values.receiptSupportContact} onChange={(e) => set("receiptSupportContact", e.target.value)} /></div>
          <div><label className="block text-xs font-semibold text-slate-500 mb-1">Receipt Number Prefix</label><input className={inputClass} value={values.receiptNumberPrefix} onChange={(e) => set("receiptNumberPrefix", e.target.value)} placeholder="RCPT" /></div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <Toggle label="Include Organization Address" checked={values.receiptShowAddress} onChange={(v) => set("receiptShowAddress", v)} />
          <Toggle label="Include Organization Phone" checked={values.receiptShowPhone} onChange={(v) => set("receiptShowPhone", v)} />
          <Toggle label="Include Organization Email" checked={values.receiptShowEmail} onChange={(v) => set("receiptShowEmail", v)} />
          <Toggle label="Include Organization Website" checked={values.receiptShowWebsite} onChange={(v) => set("receiptShowWebsite", v)} />
          <Toggle label="Include Fund/Campaign" checked={values.receiptShowFund} onChange={(v) => set("receiptShowFund", v)} />
          <Toggle label="Include Donor-Covered Fee" checked={values.receiptShowDonorCoveredFee} onChange={(v) => set("receiptShowDonorCoveredFee", v)} />
          <Toggle label="Include Payment Method Last Four" checked={values.receiptShowPaymentMethodLastFour} onChange={(v) => set("receiptShowPaymentMethodLastFour", v)} />
          <Toggle label="Include Recurring Schedule Details" checked={values.receiptShowRecurringSchedule} onChange={(v) => set("receiptShowRecurringSchedule", v)} />
          <Toggle label="Include Donation Reference" checked={values.receiptShowDonationReference} onChange={(v) => set("receiptShowDonationReference", v)} />
          <Toggle label="Include EIN / Tax ID" checked={values.receiptShowTaxId} onChange={(v) => set("receiptShowTaxId", v)} />
          <Toggle label="Send Copy to Organization" checked={values.receiptSendCopyToOrg} onChange={(v) => set("receiptSendCopyToOrg", v)} />
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold text-slate-700 mb-1">Acknowledgment Wording</p>
          <p className="text-xs text-slate-500 mb-3">
            Used on both donation receipts and year-end statements. WGC does not provide tax or legal advice — your organization is
            responsible for ensuring this wording complies with applicable tax laws.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">When No Goods or Services Were Provided</label>
              <textarea
                className={inputClass}
                rows={2}
                value={values.acknowledgmentNoGoodsServicesText}
                onChange={(e) => set("acknowledgmentNoGoodsServicesText", e.target.value)}
                placeholder="No goods or services were provided in exchange for this contribution."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">When Goods or Services Were Provided</label>
              <textarea
                className={inputClass}
                rows={2}
                value={values.acknowledgmentGoodsServicesTemplate}
                onChange={(e) => set("acknowledgmentGoodsServicesTemplate", e.target.value)}
                placeholder="Goods or services valued at [VALUE] were provided in exchange for this contribution. [DESCRIPTION]"
              />
              <p className="text-[11px] text-slate-400 mt-1">Use [VALUE] and [DESCRIPTION] as placeholders — replaced per contribution.</p>
            </div>
          </div>
        </div>

        <SettingsSaveBar isDirty={isDirty} saving={saving} error={error} onSave={save} onReset={() => setValues(initial)} />
      </div>

      <div>
        <p className="text-xs font-semibold text-slate-500 mb-2">Live Preview (Sample Data)</p>
        <div className="border border-slate-200 rounded-xl overflow-hidden h-[420px]">
          <iframe key={previewKey} src="/api/merchant/settings/receipts/preview" className="w-full h-full border-0" title="Receipt preview" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <input type="email" placeholder="Send test receipt to…" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className={inputClass} />
          <button onClick={sendTest} disabled={sendingTest} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold whitespace-nowrap disabled:opacity-50">
            {sendingTest ? "Sending…" : "Send Test Receipt"}
          </button>
        </div>
      </div>
    </div>
  );
}
