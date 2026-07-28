"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
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

interface Donor {
  id: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  addressSource: string | null;
  addressVerified: string;
  lastAddressConfirmedAt: string | null;
  addressUpdatedAt: string | null;
}

export default function DonorAddressCard({
  donor,
  canEdit,
  canConfirm,
  canViewSource,
}: {
  donor: Donor;
  canEdit: boolean;
  canConfirm: boolean;
  canViewSource: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line1, setLine1] = useState(donor.addressLine1 || "");
  const [line2, setLine2] = useState(donor.addressLine2 || "");
  const [city, setCity] = useState(donor.city || "");
  const [state, setState] = useState(donor.state || "");
  const [postalCode, setPostalCode] = useState(donor.postalCode || "");
  const [country, setCountry] = useState(donor.country || "US");
  const [source, setSource] = useState<AddressSource>("MERCHANT_MANUAL_ENTRY");

  const hasAddress = Boolean(donor.addressLine1);

  async function save(force = false) {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donor.id}/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addressLine1: line1,
          addressLine2: line2,
          city,
          state,
          postalCode,
          country,
          addressSource: source,
          forceAddressUpdate: force,
        }),
      });
      const json = await res.json();
      if (res.status === 409 && json.needsConfirmation) {
        if (confirm("This donor already has a different mailing address on file. Replace it?")) {
          return save(true);
        }
        return;
      }
      if (!res.ok) return toast.error(json.error || "Could not save address");
      toast.success("Mailing address saved");
      setEditing(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function clearAddress() {
    if (!confirm("Clear this donor's mailing address? The previous address stays in the audit history.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donor.id}/address/clear`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not clear address");
      toast.success("Address cleared");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function confirmAddress(confirmedAs: "CONFIRMED_BY_DONOR" | "CONFIRMED_BY_ORG") {
    setBusy(true);
    try {
      const res = await fetch(`/api/merchant/donors/${donor.id}/address/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmedAs }),
      });
      const json = await res.json();
      if (!res.ok) return toast.error(json.error || "Could not confirm address");
      toast.success("Address marked confirmed");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Street address" value={line1} onChange={(e) => setLine1(e.target.value)} className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Apt / suite / unit" value={line2} onChange={(e) => setLine2(e.target.value)} className="col-span-2 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="State" value={state} onChange={(e) => setState(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="ZIP / postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
          <input placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        </div>
        {canViewSource && (
          <select value={source} onChange={(e) => setSource(e.target.value as AddressSource)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
            {ADDRESS_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        )}
        <div className="flex gap-2">
          <button onClick={() => save(false)} disabled={busy} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Save
          </button>
          <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      {hasAddress ? (
        <div className="text-slate-900">
          <p>{donor.addressLine1}</p>
          {donor.addressLine2 && <p>{donor.addressLine2}</p>}
          <p>{[donor.city, donor.state, donor.postalCode].filter(Boolean).join(", ")}</p>
          {donor.country && donor.country !== "US" && <p>{donor.country}</p>}
        </div>
      ) : (
        <p className="text-slate-400">No mailing address on file</p>
      )}

      {hasAddress && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              donor.addressVerified === "UNVERIFIED" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
            }`}
          >
            {donor.addressVerified === "UNVERIFIED" ? "Unverified" : donor.addressVerified === "CONFIRMED_BY_DONOR" ? "Confirmed by donor" : "Confirmed by organization"}
          </span>
          {canViewSource && donor.addressSource && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{SOURCE_LABELS[donor.addressSource as AddressSource] || donor.addressSource}</span>
          )}
        </div>
      )}
      {donor.lastAddressConfirmedAt && <p className="text-xs text-slate-400">Confirmed {new Date(donor.lastAddressConfirmedAt).toLocaleDateString()}</p>}
      {donor.addressUpdatedAt && <p className="text-xs text-slate-400">Last updated {new Date(donor.addressUpdatedAt).toLocaleDateString()}</p>}

      {canEdit && (
        <div className="flex flex-wrap gap-3 pt-2">
          <button onClick={() => setEditing(true)} className="text-xs font-semibold text-blue-600 hover:underline">
            {hasAddress ? "Edit Mailing Address" : "Add Mailing Address"}
          </button>
          {hasAddress && canConfirm && donor.addressVerified === "UNVERIFIED" && (
            <button onClick={() => confirmAddress("CONFIRMED_BY_ORG")} disabled={busy} className="text-xs font-semibold text-green-700 hover:underline">
              Mark Confirmed
            </button>
          )}
          {hasAddress && (
            <button onClick={clearAddress} disabled={busy} className="text-xs font-semibold text-red-600 hover:underline">
              Clear Address
            </button>
          )}
        </div>
      )}
    </div>
  );
}
