"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import SettingsSaveBar from "@/components/merchant/SettingsSaveBar";
import { useUnsavedChangesWarning } from "@/lib/settings/useUnsavedChanges";

const ORG_TYPE_OPTIONS = [
  { value: "NONPROFIT", label: "Nonprofit" },
  { value: "MINISTRY", label: "Ministry" },
  { value: "CHARITY", label: "Charity" },
  { value: "FAITH_BASED", label: "Faith-Based Organization" },
  { value: "COMMUNITY", label: "Community Organization" },
  { value: "FOUNDATION", label: "Foundation" },
  { value: "RELIGIOUS", label: "Religious Organization" },
  { value: "OTHER", label: "Other" },
];

const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
];

interface FormValues {
  name: string;
  publicDisplayName: string;
  organizationType: string;
  website: string;
  phone: string;
  primaryContactEmail: string;
  supportEmail: string;
  financeEmail: string;
  technicalContactEmail: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  mailingAddressLine1: string;
  mailingCity: string;
  mailingState: string;
  mailingPostalCode: string;
  timezone: string;
  dateFormat: string;
  fiscalYearStartMonth: number;
  publicSupportContact: string;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

export default function GeneralSettingsForm({ initial }: { initial: FormValues }) {
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(isDirty);

  const set = (field: keyof FormValues, value: string | number) => setValues((v) => ({ ...v, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/merchant/settings/general", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error || "Failed to save");
      }
      toast.success("General settings saved");
      Object.assign(initial, values);
    } catch (err: any) {
      setError(err.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setValues(initial);

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Organization Legal Name">
          <input className={inputClass} value={values.name} onChange={(e) => set("name", e.target.value)} />
          {fieldErrors.name && <p className="text-xs text-red-600 mt-1">{fieldErrors.name}</p>}
        </Field>
        <Field label="Public Display Name">
          <input className={inputClass} value={values.publicDisplayName} onChange={(e) => set("publicDisplayName", e.target.value)} placeholder="Defaults to legal name" />
        </Field>
        <Field label="Organization Type">
          <select className={inputClass} value={values.organizationType} onChange={(e) => set("organizationType", e.target.value)}>
            <option value="">Select type</option>
            {ORG_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Website">
          <input className={inputClass} value={values.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
          {fieldErrors.website && <p className="text-xs text-red-600 mt-1">{fieldErrors.website}</p>}
        </Field>
        <Field label="Primary Phone">
          <input className={inputClass} value={values.phone} onChange={(e) => set("phone", e.target.value)} />
          {fieldErrors.phone && <p className="text-xs text-red-600 mt-1">{fieldErrors.phone}</p>}
        </Field>
        <Field label="Primary Contact Email">
          <input className={inputClass} value={values.primaryContactEmail} onChange={(e) => set("primaryContactEmail", e.target.value)} />
          {fieldErrors.primaryContactEmail && <p className="text-xs text-red-600 mt-1">{fieldErrors.primaryContactEmail}</p>}
        </Field>
        <Field label="Support Email">
          <input className={inputClass} value={values.supportEmail} onChange={(e) => set("supportEmail", e.target.value)} />
        </Field>
        <Field label="Finance Email">
          <input className={inputClass} value={values.financeEmail} onChange={(e) => set("financeEmail", e.target.value)} />
        </Field>
        <Field label="Technical Contact Email">
          <input className={inputClass} value={values.technicalContactEmail} onChange={(e) => set("technicalContactEmail", e.target.value)} />
        </Field>
        <Field label="Public Support Contact">
          <input className={inputClass} value={values.publicSupportContact} onChange={(e) => set("publicSupportContact", e.target.value)} placeholder="Shown to donors" />
        </Field>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Primary Address</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Address Line 1"><input className={inputClass} value={values.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} /></Field>
          <Field label="Address Line 2"><input className={inputClass} value={values.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} /></Field>
          <Field label="City"><input className={inputClass} value={values.city} onChange={(e) => set("city", e.target.value)} /></Field>
          <Field label="State"><input className={inputClass} value={values.state} onChange={(e) => set("state", e.target.value)} /></Field>
          <Field label="Postal Code"><input className={inputClass} value={values.postalCode} onChange={(e) => set("postalCode", e.target.value)} /></Field>
          <Field label="Country"><input className={inputClass} value={values.country} onChange={(e) => set("country", e.target.value)} /></Field>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Mailing Address</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Address Line 1"><input className={inputClass} value={values.mailingAddressLine1} onChange={(e) => set("mailingAddressLine1", e.target.value)} /></Field>
          <Field label="City"><input className={inputClass} value={values.mailingCity} onChange={(e) => set("mailingCity", e.target.value)} /></Field>
          <Field label="State"><input className={inputClass} value={values.mailingState} onChange={(e) => set("mailingState", e.target.value)} /></Field>
          <Field label="Postal Code"><input className={inputClass} value={values.mailingPostalCode} onChange={(e) => set("mailingPostalCode", e.target.value)} /></Field>
        </div>
      </div>

      <div className="mt-6 pt-6 border-t border-slate-100">
        <h4 className="text-sm font-bold text-slate-900 mb-3">Regional Preferences</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Time Zone">
            <select className={inputClass} value={values.timezone} onChange={(e) => set("timezone", e.target.value)}>
              <option value="">Central Time (default)</option>
              {TIMEZONE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date Format">
            <select className={inputClass} value={values.dateFormat} onChange={(e) => set("dateFormat", e.target.value)}>
              <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Fiscal Year Start Month">
            <select className={inputClass} value={values.fiscalYearStartMonth} onChange={(e) => set("fiscalYearStartMonth", parseInt(e.target.value, 10))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{new Date(2026, m - 1, 1).toLocaleString("en-US", { month: "long" })}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <SettingsSaveBar isDirty={isDirty} saving={saving} error={error} onSave={save} onReset={reset} />
    </div>
  );
}
