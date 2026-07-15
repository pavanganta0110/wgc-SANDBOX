"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import SettingsSaveBar from "@/components/merchant/SettingsSaveBar";
import { useUnsavedChangesWarning } from "@/lib/settings/useUnsavedChanges";

interface FormValues {
  defaultGivingLinkId: string;
  givingTermsUrl: string;
  givingPrivacyUrl: string;
  givingSupportEmail: string;
}

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

export default function GivingSettingsForm({
  initial,
  givingLinks,
}: {
  initial: FormValues;
  givingLinks: { id: string; internalName: string; publicTitle: string }[];
}) {
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(isDirty);

  const set = (field: keyof FormValues, value: string) => setValues((v) => ({ ...v, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/merchant/settings/giving", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Giving settings saved");
      Object.assign(initial, values);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-slate-500 mb-6">
        Per-link donation amounts, frequencies, and fee-cover settings are managed on each individual{" "}
        <a href="/merchant/giving-links" className="text-blue-600 hover:underline">Giving Link</a>. These settings apply organization-wide.
      </p>
      <div className="grid grid-cols-1 gap-4 max-w-lg">
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Default Giving Link</label>
          <select className={inputClass} value={values.defaultGivingLinkId} onChange={(e) => set("defaultGivingLinkId", e.target.value)}>
            <option value="">None selected</option>
            {givingLinks.map((l) => (
              <option key={l.id} value={l.id}>{l.internalName}</option>
            ))}
          </select>
          {givingLinks.length === 0 && <p className="text-xs text-slate-400 mt-1">No active Giving Links yet.</p>}
          {fieldErrors.defaultGivingLinkId && <p className="text-xs text-red-600 mt-1">{fieldErrors.defaultGivingLinkId}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Donation Form Terms URL</label>
          <input className={inputClass} value={values.givingTermsUrl} onChange={(e) => set("givingTermsUrl", e.target.value)} placeholder="https://" />
          {fieldErrors.givingTermsUrl && <p className="text-xs text-red-600 mt-1">{fieldErrors.givingTermsUrl}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Privacy Policy URL</label>
          <input className={inputClass} value={values.givingPrivacyUrl} onChange={(e) => set("givingPrivacyUrl", e.target.value)} placeholder="https://" />
          {fieldErrors.givingPrivacyUrl && <p className="text-xs text-red-600 mt-1">{fieldErrors.givingPrivacyUrl}</p>}
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 mb-1">Giving Page Support Email</label>
          <input className={inputClass} value={values.givingSupportEmail} onChange={(e) => set("givingSupportEmail", e.target.value)} />
          {fieldErrors.givingSupportEmail && <p className="text-xs text-red-600 mt-1">{fieldErrors.givingSupportEmail}</p>}
        </div>
      </div>
      <SettingsSaveBar isDirty={isDirty} saving={saving} error={error} onSave={save} onReset={() => setValues(initial)} />
    </div>
  );
}
