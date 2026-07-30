"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ADDRESS_SOURCES, type AddressSource } from "@/lib/donors/donorAddress";

const SOURCE_LABELS: Record<AddressSource, string> = {
  ONLINE_DONATION_FORM: "Online donation form",
  MERCHANT_MANUAL_ENTRY: "Entered by staff",
  EXTERNAL_DONATION: "External donation entry",
  DONOR_PORTAL: "Donor portal",
  CRM_IMPORT: "CRM import",
  CSV_IMPORT: "CSV import",
  DONATION_ENVELOPE: "Donation envelope",
  CHECK: "Check",
  PLEDGE_FORM: "Pledge form",
  EXISTING_ORGANIZATION_RECORD: "Existing organization record",
  OTHER: "Other",
};

export interface DonorAddressValue {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  source: AddressSource;
}

export const EMPTY_DONOR_ADDRESS: DonorAddressValue = {
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
  source: "MERCHANT_MANUAL_ENTRY",
};

/**
 * Collapsed-by-default "Donor Mailing Address" section for merchant-entry
 * flows (Record External Donation, Add Donor). Never required — the parent
 * form only reads these values when the merchant actually opened and filled
 * the section (see hasAnyAddressField at the call site).
 */
export default function DonorMailingAddressSection({
  value,
  onChange,
  readOnlyPreview,
}: {
  value: DonorAddressValue;
  onChange: (v: DonorAddressValue) => void;
  /** When set, shows this existing donor's saved address as a read-only
   * summary instead of the entry form — used when the merchant picks an
   * existing donor rather than typing a brand-new address. */
  readOnlyPreview?: { addressLine1: string | null; city: string | null; state: string | null; postalCode: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const set = (field: keyof DonorAddressValue, v: string) => onChange({ ...value, [field]: v });

  if (readOnlyPreview !== undefined) {
    if (readOnlyPreview?.addressLine1) {
      return (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-semibold text-slate-500 mb-1">Donor Mailing Address (on file)</p>
          <p className="text-slate-700">{readOnlyPreview.addressLine1}</p>
          <p className="text-slate-700">{[readOnlyPreview.city, readOnlyPreview.state, readOnlyPreview.postalCode].filter(Boolean).join(", ")}</p>
        </div>
      );
    }
    return <p className="text-xs text-slate-400">This donor has no mailing address on file.</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-700"
      >
        Donor Mailing Address
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          <p className="text-xs text-slate-400">Use this address for mailed receipts and annual statements.</p>
          <input placeholder="Street address" value={value.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Apartment, suite, or unit" value={value.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="City" value={value.city} onChange={(e) => set("city", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="State" value={value.state} onChange={(e) => set("state", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            <input placeholder="ZIP / postal code" value={value.postalCode} onChange={(e) => set("postalCode", e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          </div>
          <input placeholder="Country" value={value.country} onChange={(e) => set("country", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">How was this address obtained?</label>
            <select value={value.source} onChange={(e) => set("source", e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
              {ADDRESS_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
