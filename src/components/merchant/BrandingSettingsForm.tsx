"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import SettingsSaveBar from "@/components/merchant/SettingsSaveBar";
import { useUnsavedChangesWarning } from "@/lib/settings/useUnsavedChanges";

interface FormValues {
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

const inputClass = "w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:border-slate-400";

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"} onChange={(e) => onChange(e.target.value)} className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer" />
        <input className={inputClass} value={value} onChange={(e) => onChange(e.target.value)} placeholder="#0B5DBC" />
      </div>
    </div>
  );
}

export default function BrandingSettingsForm({ initial }: { initial: FormValues }) {
  const [values, setValues] = useState<FormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = JSON.stringify(values) !== JSON.stringify(initial);
  useUnsavedChangesWarning(isDirty);

  const set = <K extends keyof FormValues>(field: K, value: FormValues[K]) => setValues((v) => ({ ...v, [field]: value }));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/merchant/settings/branding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }
      toast.success("Branding saved");
      Object.assign(initial, values);
    } catch (err: any) {
      setError(err.message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md space-y-6">
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Logo URL</label>
        <input className={inputClass} value={values.logoUrl} onChange={(e) => set("logoUrl", e.target.value)} placeholder="https://…" />
        {values.logoUrl && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={values.logoUrl} alt="Logo preview" className="h-10 object-contain" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
          </div>
        )}
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500 mb-1">Favicon URL</label>
        <input className={inputClass} value={values.faviconUrl} onChange={(e) => set("faviconUrl", e.target.value)} placeholder="https://…" />
      </div>
      <ColorField label="Primary Color" value={values.primaryColor} onChange={(v) => set("primaryColor", v)} />
      <ColorField label="Secondary Color" value={values.secondaryColor} onChange={(v) => set("secondaryColor", v)} />
      <ColorField label="Accent Color" value={values.accentColor} onChange={(v) => set("accentColor", v)} />

      <SettingsSaveBar isDirty={isDirty} saving={saving} error={error} onSave={save} onReset={() => setValues(initial)} />
    </div>
  );
}
