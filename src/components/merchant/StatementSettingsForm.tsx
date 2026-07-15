"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { DEFAULT_THANK_YOU_MESSAGE, STATEMENT_DISCLAIMER } from "@/lib/donors/generateStatementDefaults";

interface Settings {
  logoUrl: string | null;
  taxId: string | null;
  website: string | null;
  statementSenderName: string | null;
  statementReplyToEmail: string | null;
  statementSubjectTemplate: string | null;
  statementThankYouMessage: string | null;
  statementDisclaimer: string | null;
  statementShowDonorCoveredFees: boolean;
  statementShowTaxId: boolean;
  statementShowWebsite: boolean;
  statementSignatureName: string | null;
  statementSignatureTitle: string | null;
  statementSignatureImageUrl: string | null;
}

export default function StatementSettingsForm({ initial }: { initial: Settings }) {
  const [values, setValues] = useState({
    logoUrl: initial.logoUrl || "",
    taxId: initial.taxId || "",
    statementSenderName: initial.statementSenderName || "",
    statementReplyToEmail: initial.statementReplyToEmail || "",
    statementSubjectTemplate: initial.statementSubjectTemplate || "",
    statementThankYouMessage: initial.statementThankYouMessage || "",
    statementDisclaimer: initial.statementDisclaimer || "",
    statementShowDonorCoveredFees: initial.statementShowDonorCoveredFees,
    statementShowTaxId: initial.statementShowTaxId,
    statementShowWebsite: initial.statementShowWebsite,
    statementSignatureName: initial.statementSignatureName || "",
    statementSignatureTitle: initial.statementSignatureTitle || "",
    statementSignatureImageUrl: initial.statementSignatureImageUrl || "",
  });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof typeof values, value: string | boolean) => setValues((v) => ({ ...v, [field]: value }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/merchant/settings/annual-statements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      toast.success("Statement settings saved");
    } catch (err: any) {
      toast.error(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Field label="Organization Logo URL" value={values.logoUrl} onChange={(v) => set("logoUrl", v)} placeholder="https://…" />
      <Field label="EIN / Tax Identification Number" value={values.taxId} onChange={(v) => set("taxId", v)} />
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={values.statementShowTaxId} onChange={(e) => set("statementShowTaxId", e.target.checked)} />
        Show EIN / Tax ID on statements
      </label>

      <Field label="Statement Sender Name" value={values.statementSenderName} onChange={(v) => set("statementSenderName", v)} placeholder={"Defaults to organization name"} />
      <Field label="Reply-To Email" value={values.statementReplyToEmail} onChange={(v) => set("statementReplyToEmail", v)} placeholder="support@yourorganization.org" />
      <Field label="Subject Template" value={values.statementSubjectTemplate} onChange={(v) => set("statementSubjectTemplate", v)} placeholder="Your [YEAR] Year-End Donation Statement from [Organization Name]" />

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Thank-You Message</label>
        <textarea
          value={values.statementThankYouMessage}
          onChange={(e) => set("statementThankYouMessage", e.target.value)}
          rows={2}
          placeholder={DEFAULT_THANK_YOU_MESSAGE}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Disclaimer</label>
        <textarea
          value={values.statementDisclaimer}
          onChange={(e) => set("statementDisclaimer", e.target.value)}
          rows={3}
          placeholder={STATEMENT_DISCLAIMER}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="text-xs text-slate-400 mt-1">Leave blank to use the default record-keeping disclaimer.</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={values.statementShowDonorCoveredFees} onChange={(e) => set("statementShowDonorCoveredFees", e.target.checked)} />
        Show donor-covered processing fees separately on statements
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={values.statementShowWebsite} onChange={(e) => set("statementShowWebsite", e.target.checked)} />
        Show organization website on statements
      </label>

      <div className="pt-2 border-t border-slate-100">
        <p className="text-xs font-semibold text-slate-700 mt-3 mb-1">Authorized Signature (optional)</p>
        <Field label="Signature Name" value={values.statementSignatureName} onChange={(v) => set("statementSignatureName", v)} />
        <Field label="Signature Title" value={values.statementSignatureTitle} onChange={(v) => set("statementSignatureTitle", v)} placeholder="e.g. Executive Director" />
        <Field label="Signature Image URL" value={values.statementSignatureImageUrl} onChange={(v) => set("statementSignatureImageUrl", v)} placeholder="https://…" />
      </div>

      <button onClick={save} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50">
        {saving ? "Saving…" : "Save Settings"}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
