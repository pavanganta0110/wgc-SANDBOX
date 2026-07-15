"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { X } from "lucide-react";

export interface DonorFormValues {
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  companyName: string;
  anonymousPreference: boolean;
  internalNote?: string;
}

const EMPTY_FORM: DonorFormValues = {
  name: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  companyName: "",
  anonymousPreference: false,
  internalNote: "",
};

export default function DonorFormModal({
  mode,
  donorId,
  initialValues,
  onClose,
}: {
  mode: "create" | "edit";
  donorId?: string;
  initialValues?: Partial<DonorFormValues>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<DonorFormValues>({ ...EMPTY_FORM, ...initialValues });
  const [saving, setSaving] = useState(false);

  const set = (field: keyof DonorFormValues, value: string | boolean) => setValues((v) => ({ ...v, [field]: value }));

  const submit = async () => {
    if (!values.name.trim()) {
      toast.error("Donor name is required");
      return;
    }
    setSaving(true);
    try {
      const url = mode === "create" ? "/api/merchant/donors/create" : `/api/merchant/donors/${donorId}/update`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save donor");

      toast.success(mode === "create" ? "Donor added" : "Donor updated");
      onClose();
      if (mode === "create" && data.donor?.id) {
        router.push(`/merchant/donors/${data.donor.id}`);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || "Failed to save donor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900">{mode === "create" ? "Add Donor" : "Edit Donor"}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          <Field label="Full Name" value={values.name} onChange={(v) => set("name", v)} required />
          <Field label="Email" value={values.email} onChange={(v) => set("email", v)} type="email" />
          <Field label="Phone" value={values.phone} onChange={(v) => set("phone", v)} />
          <Field label="Organization/Company" value={values.companyName} onChange={(v) => set("companyName", v)} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Street Address" value={values.addressLine1} onChange={(v) => set("addressLine1", v)} />
            <Field label="Apartment/Suite" value={values.addressLine2} onChange={(v) => set("addressLine2", v)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="City" value={values.city} onChange={(v) => set("city", v)} />
            <Field label="State" value={values.state} onChange={(v) => set("state", v)} />
            <Field label="Postal Code" value={values.postalCode} onChange={(v) => set("postalCode", v)} />
          </div>
          <Field label="Country" value={values.country} onChange={(v) => set("country", v)} />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={values.anonymousPreference} onChange={(e) => set("anonymousPreference", e.target.checked)} />
            Always display this donor as anonymous
          </label>
          {mode === "create" && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Internal Note</label>
              <textarea
                value={values.internalNote}
                onChange={(e) => set("internalNote", e.target.value)}
                rows={2}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-500 hover:text-slate-800">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "create" ? "Add Donor" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 mb-1">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
