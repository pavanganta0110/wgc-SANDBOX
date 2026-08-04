"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import DonorPicker from "@/components/merchant/DonorPicker";

interface DonorHit {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface ClientFormValues {
  id?: string;
  clientType: "INDIVIDUAL" | "ORGANIZATION";
  firstName: string;
  lastName: string;
  organizationName: string;
  email: string;
  phone: string;
  billingAddressLine1: string;
  billingAddressLine2: string;
  billingCity: string;
  billingState: string;
  billingPostalCode: string;
  billingCountry: string;
  shippingAddressLine1: string;
  shippingAddressLine2: string;
  shippingCity: string;
  shippingState: string;
  shippingPostalCode: string;
  shippingCountry: string;
  contactPersonName: string;
  taxOrReferenceId: string;
  notes: string;
  linkedDonorId: string | null;
  linkedDonor: DonorHit | null;
}

const EMPTY: ClientFormValues = {
  clientType: "INDIVIDUAL",
  firstName: "",
  lastName: "",
  organizationName: "",
  email: "",
  phone: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingCity: "",
  billingState: "",
  billingPostalCode: "",
  billingCountry: "",
  shippingAddressLine1: "",
  shippingAddressLine2: "",
  shippingCity: "",
  shippingState: "",
  shippingPostalCode: "",
  shippingCountry: "",
  contactPersonName: "",
  taxOrReferenceId: "",
  notes: "",
  linkedDonorId: null,
  linkedDonor: null,
};

interface DuplicateCandidate {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  matchedOn: string[];
}

export default function ClientForm({
  mode,
  initial,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: Partial<ClientFormValues>;
  /** When set (e.g. invoked from the invoice builder's "create client
   * inline" flow), called instead of navigating away after a successful
   * save. */
  onSaved?: (client: { id: string; displayName: string }) => void;
}) {
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>({ ...EMPTY, ...initial });
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[] | null>(null);

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function submit(acknowledgeDuplicates: boolean) {
    setSaving(true);
    try {
      const body = { ...values, linkedDonorId: values.linkedDonorId, acknowledgeDuplicates };
      const url = mode === "create" ? "/api/merchant/clients/create" : `/api/merchant/clients/${values.id}/update`;
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.status === 409 && data.possibleDuplicates) {
        setDuplicates(data.possibleDuplicates);
        return;
      }
      if (!data.success) {
        toast.error(data.error || "Could not save client.");
        return;
      }
      toast.success(mode === "create" ? "Client created." : "Client updated.");
      setDuplicates(null);
      if (onSaved) {
        onSaved({ id: data.client.id, displayName: data.client.displayName });
      } else {
        router.push(`/merchant/clients/${data.client.id}`);
        router.refresh();
      }
    } catch {
      toast.error("Could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6 max-w-2xl">
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Client type</label>
        <div className="flex gap-2">
          {(["INDIVIDUAL", "ORGANIZATION"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("clientType", t)}
              className={`px-4 py-2 rounded-full border text-sm font-medium ${
                values.clientType === t ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {t === "INDIVIDUAL" ? "Individual" : "Organization"}
            </button>
          ))}
        </div>
      </div>

      {values.clientType === "INDIVIDUAL" ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">First name</label>
            <input value={values.firstName} onChange={(e) => set("firstName", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Last name</label>
            <input value={values.lastName} onChange={(e) => set("lastName", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Organization name</label>
          <input value={values.organizationName} onChange={(e) => set("organizationName", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
          <input type="email" value={values.email} onChange={(e) => set("email", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
          <input value={values.phone} onChange={(e) => set("phone", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      </div>

      {values.clientType === "ORGANIZATION" && (
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Contact person</label>
          <input value={values.contactPersonName} onChange={(e) => set("contactPersonName", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
        </div>
      )}

      <div>
        <h4 className="text-sm font-bold text-slate-900 mb-2">Billing address</h4>
        <div className="space-y-2">
          <input placeholder="Address line 1" value={values.billingAddressLine1} onChange={(e) => set("billingAddressLine1", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <input placeholder="Address line 2" value={values.billingAddressLine2} onChange={(e) => set("billingAddressLine2", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          <div className="grid grid-cols-4 gap-2">
            <input placeholder="City" value={values.billingCity} onChange={(e) => set("billingCity", e.target.value)} className="col-span-2 px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="State" value={values.billingState} onChange={(e) => set("billingState", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
            <input placeholder="ZIP" value={values.billingPostalCode} onChange={(e) => set("billingPostalCode", e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm" />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Internal / tax reference</label>
        <input value={values.taxOrReferenceId} onChange={(e) => set("taxOrReferenceId", e.target.value)} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">Notes (internal only)</label>
        <textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm" />
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1">
          Linked donor <span className="font-normal text-slate-400">(optional — a client is not automatically a donor)</span>
        </label>
        <DonorPicker
          selected={values.linkedDonor}
          onSelect={(donor) => {
            set("linkedDonorId", donor.id);
            set("linkedDonor", donor);
          }}
          onClear={() => {
            set("linkedDonorId", null);
            set("linkedDonor", null);
          }}
        />
      </div>

      {duplicates && duplicates.length > 0 && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
          <p className="text-sm font-semibold text-amber-800">Possible duplicate client(s) found:</p>
          <ul className="text-sm text-amber-700 list-disc list-inside">
            {duplicates.map((d) => (
              <li key={d.id}>
                {d.displayName} — matched on {d.matchedOn.join(", ")}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={saving}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
          >
            Save anyway
          </button>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-slate-50">
        <button
          type="button"
          onClick={() => submit(false)}
          disabled={saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : mode === "create" ? "Create Client" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
